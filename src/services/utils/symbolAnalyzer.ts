// src/services/utils/symbolAnalyzer.ts

import type * as AST from '../../core/ast.js';
import type { builtInFunctionNames } from '../../core/builtIns.js';
import { type MeaoiuType, typeMap } from '../../core/typedef.js';
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
			case 'NumericLiteral':
				return typeMap.number;
			case 'StringLiteral':
				return typeMap.string;
			case 'BooleanLiteral':
				return typeMap.boolean;
			case 'NullLiteral':
				return typeMap.null;
			case 'Identifier':
				return this.lookup(node.symbol)?.type ?? typeMap.unknown;
			case 'CallExpression': {
				const func = this.lookup(node.callee.symbol);
				if (func?.kind === 'function') return typeMap.unknown;
				return typeMap.unknown;
			}
			case 'BinaryExpression': {
				const op = node.operator;
				if (['>', '<', '>=', '<=', '=='].includes(op)) return typeMap.boolean;
				if (['+', '-', '*', '/'].includes(op)) return typeMap.number;
				return typeMap.unknown;
			}
			case 'LogicalExpression':
				return typeMap.boolean;
			case 'SequenceExpression':
				return typeMap.number;
			case 'BlockStatement':
				return node.isCollection ? typeMap.collection : typeMap.unknown;
			case 'MemberAccessExpression':
				// @ 访问符，目前无法静态知道它会返回什么
				return typeMap.unknown;
			case 'UnaryExpression':
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
			case 'Program':
			case 'BlockStatement': {
				this.enterScope();
				node.body.forEach(n => this.visit(n));
				this.leaveScope();
				break;
			}
			case 'IfStatement': {
				this.visit(node.test);
				this.visit(node.consequent);
				this.visit(node.alternate);
				break;
			}
			case 'LoopStatement':
				this.visit(node.body);
				break;
			case 'ReturnStatement':
			case 'AmbushStatement':
				this.visit(node.argument);
				break;
			case 'FunctionDeclaration':
				this.visitFunctionDeclaration(node);
				break;
			case 'VariableDeclaration':
				this.visitVariableDeclaration(node);
				break;
			case 'AssignmentStatement':
				this.visitAssignmentStatement(node);
				break;
			case 'ExpressionStatement':
				this.visit(node.expression);
				break;
			case 'CallExpression':
				this.visit(node.args);
				this.visit(node.callee);
				break;
			case 'MemberAccessExpression':
				this.visit(node.object);
				this.visit(node.property);
				break;
			case 'UnaryExpression':
				this.visit(node.argument);
				break;
			case 'BinaryExpression':
				this.visitBinaryExpression(node);
				break;
			case 'SequenceExpression':
				node.sections.forEach(s => this.visit(s));
				break;
			case 'Identifier':
				this.visitIdentifier(node);
				break;
			case 'LogicalExpression':
			case 'NumericLiteral':
			case 'StringLiteral':
			case 'BooleanLiteral':
			case 'NullLiteral':
			case 'BreakStatement':
			case 'ErrorNode':
				break;
			default: // 此处已推断为不可达
				console.warn(`[符号分析器] 发现不可描述的节点: `, node);
		}
	}

	private visitFunctionDeclaration(node: AST.FunctionDeclaration) {
		this.declare(node.name.symbol, 'function', typeMap.function, node.name);
		this.enterScope();

		for (const paramStmt of node.params.body) {
			if (paramStmt.type === 'VariableDeclaration') {
				// 情况 1: [= a 就是 1 =] 或 [= 蹭 a =]
				// 这种语句本身就包含了声明逻辑，直接 visit 即可
				this.visitVariableDeclaration(paramStmt);
			} else if (paramStmt.type === 'ExpressionStatement') {
				const expr = paramStmt.expression;

				if (expr.type === 'Identifier') {
					// 情况 2: [= a =]
					// 手动将 'a' 声明为 'parameter'
					this.declare(expr.symbol, 'parameter', typeMap.unknown, expr);
					this.visitIdentifier(expr); // 访问它，以便高亮和引用查找
				} else if (expr.type === 'UnaryExpression' && expr.argument.type === 'Identifier') {
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
		let inferredType = typeMap.null;
		let valueRef: SymbolInfo | undefined; // 存储引用的符号

		if (node.initialization) {
			const init = node.initialization;
			inferredType = this.inferExpressionType(init.value);
			this.visit(init.value);

			// 只有 '就是' (Reference) 才创建静态引用链
			// '才是' (Move) 和 '就像' (Copy) 不创建引用链
			if (init.kind === 'Reference' && init.value.type === 'Identifier') {
				valueRef = this.lookup(init.value.symbol, false);
			}

			if (init.kind === 'Move' && init.value.type === 'Identifier') this.markAsMoved(init.value.symbol);
		}
		this.declare(node.identifier.symbol, 'variable', inferredType, node.identifier, valueRef);
	}

	private visitAssignmentStatement(node: AST.AssignmentStatement) {
		this.visit(node.value);
		const valueType = this.inferExpressionType(node.value);

		this.visit(node.assignee);

		if (node.assignee.type === 'Identifier') {
			const varName = node.assignee.symbol;
			const symbol = this.lookup(varName, false); // 查找原始符号（不追踪链）

			if (symbol) {
				symbol.type = valueType;

				// 只有 '就是' (Reference) 才更新静态引用链
				if (node.kind === 'Reference' && node.value.type === 'Identifier') {
					symbol.valueRef = this.lookup(node.value.symbol, false);
				} else {
					// '才是' (Move) 和 '就像' (Copy) 会打断旧的引用链
					symbol.valueRef = undefined;
				}
			}
		}

		if (node.kind === 'Move' && node.value.type === 'Identifier') this.markAsMoved(node.value.symbol);
	}

	private visitBinaryExpression(node: AST.BinaryExpression) {
		this.visit(node.left);
		this.visit(node.right);

		const leftType = this.inferExpressionType(node.left);
		const rightType = this.inferExpressionType(node.right);
		const op = node.operator;
		// 看不懂不说话喵
		if (leftType === typeMap.unknown || rightType === typeMap.unknown) return;
		if (['+', '>', '<', '>=', '<='].includes(op)) {
			if (
				leftType === rightType &&
				(leftType === typeMap.number || leftType === typeMap.string || (leftType === typeMap.collection && op === '+'))
			) {
				return;
			}
			this.errors.push({
				message: `'${op}' 操作符不能用于 '${leftType}' 和 '${rightType}' 之间喵!`,
				line: node.line,
				col: node.col,
			});
		} else if (['-', '*', '/'].includes(op)) {
			if (leftType === rightType && leftType === typeMap.number) return;
			this.errors.push({
				message: `'${op}' 操作符只能用于两个 ${typeMap.number} 之间喵!`,
				line: node.line,
				col: node.col,
			});
		}
	}

	private visitIdentifier(node: AST.Identifier) {
		const symbol = this.lookup(node.symbol); // 默认 resolveChain = true
		if (symbol) {
			if (symbol.isMoved) {
				// 这个 isMoved 状态是经过传播的
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
				// 为了缓存，把“第一环”也标记为已移动
				foundSymbol.isMoved = true;
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
