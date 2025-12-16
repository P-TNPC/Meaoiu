// src/api/utils/symbolAnalyzer.ts

import type * as AST from '../../core/ast.js';
import { AssignmentKind, NodeType } from '../../core/ast.js';
import type { MeaoiuBuiltInNames } from '../../core/builtIns.js';
import { errorFrom, type MeaoiuError } from '../../core/error.js';
import { MeaoiuType, checkArithmeticOperation, checkComparisonOperation } from '../../core/typedef.js';
import { SymbolKind, SymbolTag, type Scope, type SymbolInfo } from './symbolTable.js';

class SymbolAnalyzer {
	public readonly errors: MeaoiuError[] = [];
	public readonly symbolMap: Map<AST.Node, SymbolInfo> = new Map();
	public readonly nodeScopeMap: Map<AST.Node, Scope> = new Map();
	private currentScope: Scope;

	constructor(rootScope: Scope) {
		this.currentScope = rootScope;
	}

	private inferExpressionType(node: AST.Expression): MeaoiuType {
		switch (node.type) {
			case NodeType.NumericLiteral:
				return MeaoiuType.NUMBER;
			case NodeType.StringLiteral:
				return MeaoiuType.STRING;
			case NodeType.BooleanLiteral:
			case NodeType.ComparisonExpression:
			case NodeType.LogicalExpression:
				return MeaoiuType.BOOLEAN;
			case NodeType.NullLiteral:
				return MeaoiuType.NULL;
			case NodeType.Identifier:
				return this.lookup(node.symbol)?.type ?? MeaoiuType.UNKNOWN;
			case NodeType.BlockExpression:
				return node.isCollection ? MeaoiuType.COLLECTION : MeaoiuType.UNKNOWN;
			case NodeType.ArithmeticExpression: {
				const op = node.operator;
				if (op !== '+') return MeaoiuType.NUMBER;

				let knownType = this.inferExpressionType(node.left);
				if (knownType === MeaoiuType.UNKNOWN) knownType = this.inferExpressionType(node.right);

				return knownType === MeaoiuType.NUMBER || knownType === MeaoiuType.STRING || knownType === MeaoiuType.COLLECTION
					? knownType
					: MeaoiuType.UNKNOWN;
			}
			case NodeType.SequenceExpression: {
				const { sections, operators } = node;
				let accType = MeaoiuType.UNKNOWN;
				let knownType = this.inferExpressionType(sections[0]!);

				scan: for (let i = 0; i < operators.length; i++) {
					if (accType !== MeaoiuType.UNKNOWN) continue;
					const op = operators[i]!.value;
					switch (op) {
						case '+':
							break;
						case '==':
						case '!=':
							accType = MeaoiuType.BOOLEAN;
							break scan;
						default:
							accType = MeaoiuType.NUMBER;
							continue;
					}

					if (knownType === MeaoiuType.UNKNOWN) knownType = this.inferExpressionType(sections[i + 1]!);

					if (
						knownType === MeaoiuType.NUMBER ||
						knownType === MeaoiuType.STRING ||
						knownType === MeaoiuType.COLLECTION
					) {
						accType = knownType;
					}
				}
				return accType;
			}
			case NodeType.UnaryExpression:
				// 高仿/抢走，类型与它操作的参数一致
				return this.inferExpressionType(node.argument);
			case NodeType.MemberAccessExpression: // @ 访问符，目前无法静态知道它会返回什么
			case NodeType.CallExpression: // 函数调用，目前无法静态知道返回类型
			default:
				return MeaoiuType.UNKNOWN;
		}
	}

	public visit(node: AST.Node | undefined): void {
		if (!node) return;
		this.nodeScopeMap.set(node, this.currentScope);
		switch (node.type) {
			case NodeType.Program:
			case NodeType.BlockExpression: {
				this.enterScope();
				node.body.forEach(n => this.visit(n));
				this.leaveScope();
				break;
			}
			case NodeType.IfExpression: {
				this.visit(node.condition);
				this.visit(node.consequent);
				this.visit(node.alternate);
				break;
			}
			case NodeType.LoopExpression:
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

	private visitFunctionDeclaration(node: AST.FunctionDeclaration): void {
		this.declare(node.name.symbol, SymbolKind.FUNCTION, SymbolTag.NORMAL, MeaoiuType.FUNCTION, node.name);
		this.enterScope();

		for (const paramStmt of node.parameters.body) {
			if (paramStmt.type === NodeType.VariableDeclaration) {
				// 情况 1: [= a 就是 1 =] 或 [= 蹭 a =]
				// 这种语句本身就包含了声明逻辑，直接 visit 即可
				this.visitVariableDeclaration(paramStmt);
			} else if (paramStmt.type === NodeType.ExpressionStatement) {
				const expr = paramStmt.expression;

				if (expr.type === NodeType.Identifier) {
					// 情况 2: [= a =]
					// 手动将 'a' 声明为 'parameter'
					this.declare(expr.symbol, SymbolKind.PARAMETER, SymbolTag.NORMAL, MeaoiuType.UNKNOWN, expr);
					this.visitIdentifier(expr); // 访问它，以便高亮和引用查找
				} else if (expr.type === NodeType.UnaryExpression && expr.argument.type === NodeType.Identifier) {
					// 情况 3: [= 高仿 a =] 或 [= 抢走 a =]
					const idNode = expr.argument;
					// 手动将 'a' 声明为 'parameter'
					this.declare(idNode.symbol, SymbolKind.PARAMETER, SymbolTag.NORMAL, MeaoiuType.UNKNOWN, idNode);
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

	private visitVariableDeclaration(node: AST.VariableDeclaration): void {
		const { identifier, initialization: init } = node;
		let inferredType = MeaoiuType.NULL;
		let valueRef: SymbolInfo | undefined; // 存储引用的符号
		let tag = SymbolTag.NORMAL;

		if (init) {
			this.visit(init.value);
			inferredType = this.inferExpressionType(init.value);

			if (init.value.type === NodeType.Identifier) {
				const valueSymbol = this.symbolMap.get(init.value);
				if (valueSymbol?.tag === SymbolTag.DECAYED) tag = valueSymbol.tag; // 衰变传染

				if (init.kind === AssignmentKind.REFERENCE) valueRef = valueSymbol; // 只有 '就是' (Reference) 才创建静态引用链
				else if (init.kind === AssignmentKind.MOVE) this.markAsMoved(init.value.symbol);

				if (tag !== SymbolTag.NORMAL) {
					this.errors.push(errorFrom(identifier, `这个 '${identifier.symbol}' 没有灵魂喵！`));
				}
			}
		}
		this.declare(identifier.symbol, SymbolKind.VARIABLE, tag, inferredType, identifier, valueRef);
	}

	private visitAssignmentStatement(node: AST.AssignmentStatement): void {
		const { value, assignee, kind } = node;
		this.visit(value);
		const valueType = this.inferExpressionType(value);

		if (assignee.type !== NodeType.Identifier) this.visit(assignee);
		else {
			this.visitIdentifier(assignee, false);
			const originalSymbol = this.symbolMap.get(assignee); // 取得原始符号

			if (originalSymbol) {
				const symbol = { ...originalSymbol }; // 复制为新符号
				symbol.type = valueType;
				const valueSymbol = this.symbolMap.get(value);
				if (valueSymbol?.tag === SymbolTag.DECAYED) symbol.tag = valueSymbol.tag; // 衰变传染

				if (
					kind === AssignmentKind.REFERENCE &&
					value.type === NodeType.Identifier &&
					symbol.tag !== SymbolTag.DECAYED
				) {
					// '就是' (Reference) 为未衰变符号更新静态引用链
					symbol.valueRef = valueSymbol;
				} else {
					// '才是' (Move) 和 '就像' (Copy) 会打断旧的引用链，符号衰变也会使引用失效
					symbol.valueRef = undefined;
				}

				// 更新符号表
				this.currentScope.symbols.set(assignee.symbol, symbol);
				this.symbolMap.set(assignee, symbol);

				if (symbol.tag !== SymbolTag.NORMAL) {
					this.errors.push(errorFrom(assignee, `被移过的 '${assignee.symbol}' 失效了喵！`));
				}
			}
		}

		if (kind === AssignmentKind.MOVE && value.type === NodeType.Identifier) this.markAsMoved(value.symbol);
	}

	private visitArithmeticExpression(node: AST.ArithmeticExpression): void {
		const { operator: op, left, right } = node;
		this.visit(left);
		this.visit(right);

		let leftType = this.inferExpressionType(left);
		let rightType = this.inferExpressionType(right);

		switch ((+(leftType === MeaoiuType.UNKNOWN) << 1) | +(rightType === MeaoiuType.UNKNOWN)) {
			case 0b11: // 都不懂
				return; // 跳过检查
			case 0b10: // 左不懂
				leftType = rightType;
				break;
			case 0b01: // 右不懂
				rightType = leftType;
				break;
			case 0b00: // 全都懂
				break;
		}

		const error = checkArithmeticOperation(op, leftType, rightType);
		if (error) this.errors.push(errorFrom(node, error));
	}

	private visitComparisonExpression(node: AST.ComparisonExpression): void {
		const { expressions, operators } = node;
		let currentLeftType = this.inferExpressionType(expressions[0]!);
		this.visit(expressions[0]); // 访问第一个

		for (let i = 0; i < operators.length; i++) {
			const currentRightExpr = expressions[i + 1]!;
			let currentRightType = this.inferExpressionType(currentRightExpr); // 必须是 let
			this.visit(currentRightExpr); // 访问右边

			switch ((+(currentLeftType === MeaoiuType.UNKNOWN) << 1) | +(currentRightType === MeaoiuType.UNKNOWN)) {
				case 0b11: // 都不懂
					continue; // 跳过检查
				case 0b10: // 左不懂
					currentLeftType = currentRightType;
					break;
				case 0b01: // 右不懂
					currentRightType = currentLeftType;
					break;
				case 0b00: // 全都懂
					break;
			}

			const opToken = operators[i]!;
			const error = checkComparisonOperation(opToken.value, currentLeftType, currentRightType);
			if (error) this.errors.push(errorFrom(opToken, error));

			currentLeftType = currentRightType;
		}
	}

	private visitSequenceExpression(node: AST.SequenceExpression): void {
		const { sections, operators } = node;
		let accType = this.inferExpressionType(sections[0]!);
		this.visit(sections[0]); // 访问第一节

		for (let i = 0; i < operators.length; i++) {
			const opToken = operators[i]!,
				op = opToken.value;
			if (op === '==' || op === '!=') return this.visitComparisonSequence(node, i + 1); // 让专用检查函数接力，本函数已结束使命

			const nextExpr = sections[i + 1]!;
			let nextType = this.inferExpressionType(nextExpr);
			this.visit(nextExpr); // 访问下一节

			switch ((+(accType === MeaoiuType.UNKNOWN) << 1) | +(nextType === MeaoiuType.UNKNOWN)) {
				case 0b11: // 都不懂
					if (op !== '+') accType = MeaoiuType.NUMBER; // 非加号，锁定类型
					continue; // 跳过检查
				case 0b10: // 前不懂
					accType = nextType;
					break;
				case 0b01: // 后不懂
					nextType = accType;
					break;
				case 0b00: // 全都懂
					break;
			}

			const error = checkArithmeticOperation(op, accType, nextType);
			if (error) {
				this.errors.push(errorFrom(opToken, error));
				break; // 跳出坏链
			}

			accType = nextType;
		}
	}

	private visitComparisonSequence(node: AST.SequenceExpression, startIndex: number): void {
		const { sections, operators } = node;
		this.visit(sections[startIndex]); // 访问第一个比较操作的右侧

		// 遍历链上剩下的所有操作符
		for (let i = startIndex; i < operators.length; i++) {
			const opToken = operators[i]!,
				op = opToken.value;

			// 检查是否混入了非比较运算符
			if (op !== '==' && op !== '!=') {
				this.errors.push(errorFrom(opToken, `比较节不能混入 '${op}' 算术符喵!`));
				break; // 发现错误，中止检查
			}

			// 访问下一个元素
			this.visit(sections[i + 1]!);
		}
	}

	private visitLogicalExpression(node: AST.LogicalExpression): void {
		this.visit(node.left);
		this.visit(node.right);
	}

	private visitIdentifier(node: AST.Identifier, checkTag: boolean = true): void {
		const symbol = this.lookup(node.symbol); // 默认 resolveChain = true
		if (!symbol) {
			this.errors.push(errorFrom(node, `找不到名字为 '${node.symbol}' 的玩具喵！`));
			return;
		}
		if (checkTag && symbol.tag !== SymbolTag.NORMAL) {
			this.errors.push(errorFrom(node, `藏在 '${node.symbol}' 里的东西被移走了喵！`));
		}
		symbol.references.push(node);
		this.symbolMap.set(node, symbol);
	}

	private markAsMoved(name: string): void {
		// 查找原始符号
		const symbolToMove = this.lookup(name, false);
		if (!symbolToMove) return;

		// 追踪引用链到末端
		let finalSymbol = symbolToMove;
		while (finalSymbol.valueRef) finalSymbol = finalSymbol.valueRef;
		finalSymbol.tag = SymbolTag.MOVED;
	}

	private enterScope(): void {
		const newScope: Scope = { parent: this.currentScope, children: [], symbols: new Map() };
		this.currentScope.children.push(newScope);
		this.currentScope = newScope;
	}

	private leaveScope(): void {
		this.currentScope = this.currentScope.parent!;
	}

	private declare(
		name: string,
		kind: SymbolKind,
		tag: SymbolTag,
		type: MeaoiuType,
		declarationNode: AST.Identifier,
		valueRef?: SymbolInfo
	): void {
		if (this.currentScope.symbols.has(name)) {
			this.errors.push(errorFrom(declarationNode, `名字 '${name}' 已经被定义过了喵！`));
			return;
		}

		const symbolInfo: SymbolInfo = { name, kind, tag, type, declarations: [declarationNode], references: [], valueRef };

		this.currentScope.symbols.set(name, symbolInfo);
		this.symbolMap.set(declarationNode, symbolInfo);
	}

	private lookup(name: string, resolveChain: boolean = true): SymbolInfo | undefined {
		// 1. 在作用域中找到该名字的“第一环”
		let foundSymbol: SymbolInfo | undefined;
		for (let scope: Scope | undefined = this.currentScope; scope; scope = scope.parent) {
			if (scope.symbols.has(name)) {
				foundSymbol = scope.symbols.get(name);
				break;
			}
		}
		if (!foundSymbol) return undefined;

		// 2. 如果不需要追踪链（比如在声明时），直接返回
		if (!resolveChain) return foundSymbol;

		// 3. 追踪引用链，检查整条链上的“已移动”状态
		for (let current: SymbolInfo | undefined = foundSymbol; current; current = current.valueRef) {
			if (current.tag !== SymbolTag.NORMAL) {
				// 创建一个已衰变的符号对象
				foundSymbol = {
					...foundSymbol,
					tag: SymbolTag.DECAYED,
					type: MeaoiuType.UNKNOWN,
				};
				// 虚假的引用，仅用于提示
				foundSymbol.valueRef = {
					...foundSymbol,
					name: current.name, // 保持原始名称
					valueRef: undefined,
				};
				this.currentScope.symbols.set(name, foundSymbol);
				break;
			}
		}

		return foundSymbol;
	}
}

export type AnalyzeResult = {
	rootScope: Scope;
	errors: MeaoiuError[];
	symbolMap: SymbolAnalyzer['symbolMap'];
	nodeScopeMap: SymbolAnalyzer['nodeScopeMap'];
};

export function analyzeSymbols(ast: AST.Program, builtInNames: typeof MeaoiuBuiltInNames): AnalyzeResult {
	const rootScope: Scope = { children: [], symbols: new Map() };
	for (const name of builtInNames) {
		rootScope.symbols.set(name, {
			name,
			kind: SymbolKind.FUNCTION,
			tag: SymbolTag.NORMAL,
			type: MeaoiuType.FUNCTION,
			declarations: [],
			references: [],
			isBuiltIn: true,
		});
	}
	const analyzer = new SymbolAnalyzer(rootScope);
	analyzer.visit(ast);
	const { errors, symbolMap, nodeScopeMap } = analyzer;
	return { rootScope, errors, symbolMap, nodeScopeMap };
}
