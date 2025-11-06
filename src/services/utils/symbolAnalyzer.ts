// src/services/utils/symbolAnalyzer.ts

import type * as AST from '../../core/ast.js';
import { NodeType } from '../../core/ast.js';
import type { builtInFunctionNames } from '../../core/builtIns.js';
import { checkArithmeticOperation, checkComparisonOperation, type MeaoiuType, typeMap } from '../../core/typedef.js';
import type { Scope, SymbolInfo } from './symbolTable.js';

export interface SemanticError {
	message: string;
	line: number;
	col: number;
}

class SymbolAnalyzer {
	public errors: SemanticError[] = [];
	public symbolMap: Map<AST.Node, SymbolInfo> = new Map();
	public nodeScopeMap: Map<AST.Node, Scope> = new Map();
	private currentScope: Scope;

	constructor(rootScope: Scope) {
		this.currentScope = rootScope;
	}

	private inferExpressionType(node: AST.Expression): MeaoiuType {
		switch (node.type) {
			case NodeType.NumericLiteral:
				return typeMap.number;
			case NodeType.StringLiteral:
				return typeMap.string;
			case NodeType.BooleanLiteral:
				return typeMap.boolean;
			case NodeType.NullLiteral:
				return typeMap.null;
			case NodeType.Identifier:
				return this.lookup(node.symbol)?.type ?? typeMap.unknown;
			case NodeType.CallExpression: {
				const func = this.lookup(node.callee.symbol);
				if (func?.kind === 'function') return typeMap.unknown; // 函数调用时无法静态知道返回类型
				return typeMap.unknown;
			}
			case NodeType.ArithmeticExpression: {
				const op = node.operator;
				if (op !== '+') return typeMap.number;

				let knownType = this.inferExpressionType(node.left);
				if (knownType === typeMap.unknown) knownType = this.inferExpressionType(node.right);

				return knownType === typeMap.number || knownType === typeMap.string || knownType === typeMap.collection
					? knownType
					: typeMap.unknown;
			}
			case NodeType.ComparisonExpression:
				return typeMap.boolean;
			case NodeType.LogicalExpression:
				return typeMap.boolean;
			case NodeType.SequenceExpression: {
				let accType: MeaoiuType = typeMap.unknown;
				let knownType = this.inferExpressionType(node.sections[0]!);

				scan: for (let i = 0; i < node.operators.length; i++) {
					if (accType !== typeMap.unknown) continue;
					const op = node.operators[i]!.value;
					switch (op) {
						case '+':
							break;
						case '==':
						case '!=':
							accType = typeMap.boolean;
							break scan;
						default:
							accType = typeMap.number;
							continue;
					}

					if (knownType === typeMap.unknown) knownType = this.inferExpressionType(node.sections[i + 1]!);

					if (knownType === typeMap.number || knownType === typeMap.string || knownType === typeMap.collection) {
						accType = knownType;
					}
				}
				return accType;
			}
			case NodeType.BlockStatement:
				return node.isCollection ? typeMap.collection : typeMap.unknown;
			case NodeType.MemberAccessExpression:
				// @ 访问符，目前无法静态知道它会返回什么
				return typeMap.unknown;
			case NodeType.UnaryExpression:
				// 高仿/抢走，类型与它操作的参数一致
				return this.inferExpressionType(node.argument);
			default:
				return typeMap.unknown;
		}
	}

	public visit(node: AST.Node | undefined) {
		if (!node) return;
		this.nodeScopeMap.set(node, this.currentScope);
		switch (node.type) {
			case NodeType.Program:
			case NodeType.BlockStatement: {
				this.enterScope();
				node.body.forEach(n => this.visit(n));
				this.leaveScope();
				break;
			}
			case NodeType.IfStatement: {
				this.visit(node.test);
				this.visit(node.consequent);
				this.visit(node.alternate);
				break;
			}
			case NodeType.LoopStatement:
				this.visit(node.body);
				break;
			case NodeType.UnaryExpression:
			case NodeType.ReturnStatement:
			case NodeType.AmbushStatement:
				this.visit(node.argument);
				break;
			case NodeType.FunctionDeclaration:
				this.visitFunctionDeclaration(node);
				break;
			case NodeType.VariableDeclaration:
				this.visitVariableDeclaration(node);
				break;
			case NodeType.AssignmentStatement:
				this.visitAssignmentStatement(node);
				break;
			case NodeType.ExpressionStatement:
				this.visit(node.expression);
				break;
			case NodeType.CallExpression:
				this.visit(node.args);
				this.visit(node.callee);
				break;
			case NodeType.MemberAccessExpression:
				this.visit(node.object);
				this.visit(node.property);
				break;
			case NodeType.ArithmeticExpression:
				this.visitArithmeticExpression(node);
				break;
			case NodeType.ComparisonExpression:
				this.visitComparisonExpression(node);
				break;
			case NodeType.SequenceExpression:
				this.visitSequenceExpression(node);
				break;
			case NodeType.Identifier:
				this.visitIdentifier(node);
				break;
			case NodeType.LogicalExpression:
				this.visitLogicalExpression(node);
				break;
			case NodeType.NumericLiteral:
			case NodeType.StringLiteral:
			case NodeType.BooleanLiteral:
			case NodeType.NullLiteral:
			case NodeType.BreakStatement:
			case NodeType.ErrorNode:
				break;
			default: // 此处已推断为不可达
				const n: never = node;
				console.warn(`[符号分析器] 发现不可描述的节点 `, n);
		}
	}

	private visitFunctionDeclaration(node: AST.FunctionDeclaration) {
		this.declare(node.name.symbol, 'function', typeMap.function, node.name);
		this.enterScope();

		for (const paramStmt of node.params.body) {
			if (paramStmt.type === NodeType.VariableDeclaration) {
				// 情况 1: [= a 就是 1 =] 或 [= 蹭 a =]
				// 这种语句本身就包含了声明逻辑，直接 visit 即可
				this.visitVariableDeclaration(paramStmt);
			} else if (paramStmt.type === NodeType.ExpressionStatement) {
				const expr = paramStmt.expression;

				if (expr.type === NodeType.Identifier) {
					// 情况 2: [= a =]
					// 手动将 'a' 声明为 'parameter'
					this.declare(expr.symbol, 'parameter', typeMap.unknown, expr);
					this.visitIdentifier(expr); // 访问它，以便高亮和引用查找
				} else if (expr.type === NodeType.UnaryExpression && expr.argument.type === NodeType.Identifier) {
					// 情况 3: [= 高仿 a =] 或 [= 抢走 a =]
					const idNode = expr.argument;
					// 手动将 'a' 声明为 'parameter'
					this.declare(idNode.symbol, 'parameter', typeMap.unknown, idNode);
					this.visit(expr); // 访问整个 '高仿 a' 表达式
				} else {
					// 情况 4: [= 1+2 =] 或 [= '字面量' =] 或 [= a@1 =]
					// 没有名字，只访问表达式，不声明
					this.visit(expr);
				}
			}
		}

		this.visit(node.body);
		this.leaveScope();
	}

	private visitVariableDeclaration(node: AST.VariableDeclaration) {
		let inferredType: MeaoiuType = typeMap.null;
		let valueRef: SymbolInfo | undefined; // 存储引用的符号

		if (node.initialization) {
			const init = node.initialization;
			inferredType = this.inferExpressionType(init.value);
			this.visit(init.value);

			// 只有 '就是' (Reference) 才创建静态引用链
			// '才是' (Move) 和 '就像' (Copy) 不创建引用链
			if (init.kind === 'Reference' && init.value.type === NodeType.Identifier) {
				valueRef = this.lookup(init.value.symbol, false);
			}

			if (init.kind === 'Move' && init.value.type === NodeType.Identifier) this.markAsMoved(init.value.symbol);
		}
		this.declare(node.identifier.symbol, 'variable', inferredType, node.identifier, valueRef);
	}

	private visitAssignmentStatement(node: AST.AssignmentStatement) {
		this.visit(node.value);
		const valueType = this.inferExpressionType(node.value);

		this.visit(node.assignee);

		if (node.assignee.type === NodeType.Identifier) {
			const varName = node.assignee.symbol;
			const symbol = this.lookup(varName, false); // 查找原始符号（不追踪链）

			if (symbol) {
				symbol.type = valueType;

				// 只有 '就是' (Reference) 才更新静态引用链
				if (node.kind === 'Reference' && node.value.type === NodeType.Identifier) {
					symbol.valueRef = this.lookup(node.value.symbol, false);
				} else {
					// '才是' (Move) 和 '就像' (Copy) 会打断旧的引用链
					symbol.valueRef = undefined;
				}
			}
		}

		if (node.kind === 'Move' && node.value.type === NodeType.Identifier) this.markAsMoved(node.value.symbol);
	}

	private visitArithmeticExpression(node: AST.ArithmeticExpression) {
		const { operator: op, left, right, line, col } = node;
		this.visit(left);
		this.visit(right);

		let leftType = this.inferExpressionType(left);
		let rightType = this.inferExpressionType(right);

		// 计算状态码 (0-3)
		const state = (+(leftType === typeMap.unknown) << 1) | +(rightType === typeMap.unknown);
		// 根据状态码查表执行
		switch (state) {
			case 3: // 二进制 11: left 和 right 都是 unknown
				return;
			case 2: // 二进制 10: 仅 left 是 unknown
				leftType = rightType;
				break;
			case 1: // 二进制 01: 仅 right 是 unknown
				rightType = leftType;
				break;
			case 0: // 二进制 00: 两者都非 unknown
				break;
		}

		const error = checkArithmeticOperation(op, leftType, rightType);
		if (error) this.errors.push({ message: error, line, col });
	}

	private visitComparisonExpression(node: AST.ComparisonExpression) {
		if (node.expressions.length < 2) {
			this.visit(node.expressions[0]);
			return;
		}

		let currentLeftType = this.inferExpressionType(node.expressions[0]!);
		this.visit(node.expressions[0]); // 访问第一个

		for (let i = 0; i < node.operators.length; i++) {
			const { value: op, line, col } = node.operators[i]!;
			const currentRightExpr = node.expressions[i + 1]!;
			let currentRightType = this.inferExpressionType(currentRightExpr); // 必须是 let
			this.visit(currentRightExpr); // 访问右边

			const state = (+(currentLeftType === typeMap.unknown) << 1) | +(currentRightType === typeMap.unknown);
			switch (state) {
				case 3: // 二进制 11: left 和 right 都是 unknown
					continue; // 跳过检查
				case 2: // 二进制 10: 仅 left 是 unknown
					currentLeftType = currentRightType;
					break;
				case 1: // 二进制 01: 仅 right 是 unknown
					currentRightType = currentLeftType;
					break;
				case 0: // 二进制 00: 两者都非 unknown
					break;
			}

			const error = checkComparisonOperation(op, currentLeftType, currentRightType);
			if (error) this.errors.push({ message: error, line, col });

			currentLeftType = currentRightType;
		}
	}

	private visitSequenceExpression(node: AST.SequenceExpression) {
		let accType = this.inferExpressionType(node.sections[0]!);
		this.visit(node.sections[0]); // 访问第一节

		for (let i = 0; i < node.operators.length; i++) {
			const { value: op, line, col } = node.operators[i]!;
			if (op === '==' || op === '!=') {
				this.visitComparisonSequence(node, i + 1); // 让专用检查函数接力
				return; // 本函数已结束使命
			}
			const nextExpr = node.sections[i + 1]!;
			let nextType = this.inferExpressionType(nextExpr);
			this.visit(nextExpr); // 访问下一节

			const state = (+(accType === typeMap.unknown) << 1) | +(nextType === typeMap.unknown);
			switch (state) {
				case 3: // 二进制 11: unknown op unknown
					if (op !== '+') accType = typeMap.number; // 非加号，锁定类型
					continue; // 跳过检查
				case 2: // 二进制 10: 仅 acc 是 unknown
					accType = nextType;
					break;
				case 1: // 二进制 01: 仅 next 是 unknown
					nextType = accType;
					break;
				case 0: // 二进制 00: 两者都非 unknown
					break;
			}

			const error = checkArithmeticOperation(op, accType, nextType);
			if (error) {
				this.errors.push({ message: error, line, col });
				break; // 跳出坏链
			}

			accType = nextType;
		}
	}

	private visitComparisonSequence(node: AST.SequenceExpression, startIndex: number) {
		// 访问第一个比较操作的右侧
		this.visit(node.sections[startIndex]);

		// 遍历链上剩下的所有操作符
		for (let i = startIndex; i < node.operators.length; i++) {
			const { value: op, line, col } = node.operators[i]!;

			// 检查是否混入了非比较运算符
			if (op !== '==' && op !== '!=') {
				this.errors.push({
					message: `比较节不能混入 '${op}' 算术符喵!`,
					line: line,
					col: col,
				});
				break; // 发现错误，中止检查
			}

			// 访问下一个元素
			this.visit(node.sections[i + 1]!);
		}
	}

	private visitLogicalExpression(node: AST.LogicalExpression) {
		this.visit(node.left);
		this.visit(node.right);
	}

	private visitIdentifier(node: AST.Identifier) {
		const symbol = this.lookup(node.symbol); // 默认 resolveChain = true
		if (symbol) {
			if (symbol.isMoved) {
				this.errors.push({
					message: `使用了已经被移走的变量 '${node.symbol}'，它的碗是空的喵！`,
					line: node.line,
					col: node.col,
				});
			}
			symbol.references.push(node);
			this.symbolMap.set(node, symbol);
			return;
		}
		this.errors.push({ message: `找不到名字为 '${node.symbol}' 的玩具喵！`, line: node.line, col: node.col });
	}

	private markAsMoved(name: string) {
		// 查找原始符号
		const symbolToMove = this.lookup(name, false);

		if (symbolToMove) {
			// 追踪引用链到末端，并标记“已移动”
			let finalSymbol = symbolToMove;
			while (finalSymbol.valueRef) finalSymbol = finalSymbol.valueRef;
			finalSymbol.isMoved = true;
		}
	}

	private enterScope() {
		const newScope: Scope = { parent: this.currentScope, children: [], symbols: new Map() };
		this.currentScope.children.push(newScope);
		this.currentScope = newScope;
	}

	private leaveScope() {
		this.currentScope = this.currentScope.parent!;
	}

	private declare(
		name: string,
		kind: SymbolInfo['kind'],
		type: MeaoiuType,
		declarationNode: AST.Identifier,
		valueRef?: SymbolInfo
	) {
		if (this.currentScope.symbols.has(name)) {
			this.errors.push({
				message: `名字 '${name}' 已经被定义过了喵！`,
				line: declarationNode.line,
				col: declarationNode.col,
			});
			return;
		}

		const symbolInfo: SymbolInfo = { name, kind, type, declarations: [declarationNode], references: [], valueRef };

		this.currentScope.symbols.set(name, symbolInfo);
		this.symbolMap.set(declarationNode, symbolInfo);
	}

	private lookup(name: string, resolveChain: boolean = true): SymbolInfo | undefined {
		// 1. 在作用域中找到该名字的“第一环”
		let s: Scope | undefined = this.currentScope;
		let foundSymbol: SymbolInfo | undefined;
		while (s) {
			if (s.symbols.has(name)) {
				foundSymbol = s.symbols.get(name);
				break;
			}
			s = s.parent;
		}
		if (!foundSymbol) return undefined;

		// 2. 如果不需要追踪链（比如在声明时），直接返回
		if (!resolveChain) return foundSymbol;

		// 3. 追踪引用链，检查整条链上的“已移动”状态
		let current: SymbolInfo | undefined = foundSymbol;
		while (current) {
			if (current.isMoved) {
				// 创建一个已衰变的符号对象
				foundSymbol = {
					...foundSymbol,
					isMoved: true,
					type: typeMap.unknown,
				};
				break;
			}
			current = current.valueRef;
		}

		return foundSymbol;
	}
}

export function analyzeSymbols(
	ast: AST.Program,
	builtInNames: typeof builtInFunctionNames
): {
	rootScope: Scope;
	errors: SemanticError[];
	symbolMap: Map<AST.Node, SymbolInfo>;
	nodeScopeMap: Map<AST.Node, Scope>;
} {
	const rootScope: Scope = { children: [], symbols: new Map() };
	for (const name of builtInNames) {
		rootScope.symbols.set(name, {
			name,
			kind: 'function',
			type: typeMap.function,
			declarations: [],
			references: [],
			isBuiltIn: true,
		});
	}
	const analyzer = new SymbolAnalyzer(rootScope);
	analyzer.visit(ast);
	return { rootScope, errors: analyzer.errors, symbolMap: analyzer.symbolMap, nodeScopeMap: analyzer.nodeScopeMap };
}
