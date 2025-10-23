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
	public symbolMap: Map<AST.AstNode, SymbolInfo> = new Map();
	public nodeScopeMap: Map<AST.AstNode, Scope> = new Map();
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
			case 'LogicalExpression':
			case 'BinaryExpression':
				this.visitBinaryExpression(node);
				break;
			case 'SequenceExpression':
				node.sections.forEach(s => this.visit(s));
				break;
			case 'Identifier':
				this.visitIdentifier(node);
				break;
			case 'ErrorNode':
			case 'NumericLiteral':
			case 'StringLiteral':
			case 'BooleanLiteral':
			case 'NullLiteral':
			case 'BreakStatement':
				break;
			// default: // 此处已推断为不可达
			// 	console.warn(`[SymbolAnalyzer] Unhandled node type: ${node.type}`);
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
		let inferredType = typeMap.null; // 默认是空碗
		// 如果有初始化部分，就从初始化表达式中推断类型
		if (node.initialization) {
			inferredType = this.inferExpressionType(node.initialization.value);
			this.visit(node.initialization.value); // 继续遍历子节点

			// 处理所有权转移
			if (node.initialization.kind === 'Move' && node.initialization.value.type === 'Identifier') {
				this.markAsMoved(node.initialization.value.symbol);
			}
		}

		// 声明符号
		this.declare(node.identifier.symbol, 'variable', inferredType, node.identifier);
	}

	private visitAssignmentStatement(node: AST.AssignmentStatement) {
		this.visit(node.assignee); // 现在 assignee 是一个表达式，直接 visit 即可
		this.visit(node.value);
		if (node.kind === 'Move' && node.value.type === 'Identifier') {
			this.markAsMoved(node.value.symbol);
		}
	}

	private visitBinaryExpression(node: AST.BinaryExpression | AST.LogicalExpression) {
		this.visit(node.left);
		this.visit(node.right);

		const leftType = this.inferExpressionType(node.left);
		const rightType = this.inferExpressionType(node.right);
		const op = node.operator;
		// 看不懂不说话喵
		if (leftType === typeMap.unknown || rightType === typeMap.unknown) return;
		if (['+', '>', '<', '>=', '<='].includes(op)) {
			if (leftType === rightType && (leftType === typeMap.number || leftType === typeMap.string)) return;
			this.errors.push({
				message: `'${op}' 操作符不能用于 '${leftType}' 和 '${rightType}' 之间喵!`,
				line: node.line!,
				col: node.col!,
			});
		} else if (['-', '*', '/'].includes(op)) {
			if (leftType === rightType && leftType === typeMap.number) return;
			this.errors.push({
				message: `'${op}' 操作符只能用于两个 ${typeMap.number} 之间喵!`,
				line: node.line!,
				col: node.col!,
			});
		}
	}

	private visitIdentifier(node: AST.Identifier) {
		const symbol = this.lookup(node.symbol);
		if (symbol) {
			if (symbol.isMoved) {
				this.errors.push({
					message: `使用了已经被移走的变量 '${node.symbol}'，它的碗是空的喵！`,
					line: node.line!,
					col: node.col!,
				});
			}
			symbol.references.push(node);
			this.symbolMap.set(node, symbol);
			return;
		}
		this.errors.push({ message: `找不到名字为 '${node.symbol}' 的玩具喵！`, line: node.line!, col: node.col! });
	}

	private markAsMoved(name: string) {
		const symbol = this.lookup(name);
		if (symbol) symbol.isMoved = true;
	}

	private enterScope() {
		const newScope: Scope = { parent: this.currentScope, children: [], symbols: new Map() };
		this.currentScope.children.push(newScope);
		this.currentScope = newScope;
	}
	private leaveScope() {
		this.currentScope = this.currentScope.parent!;
	}
	private declare(name: string, kind: SymbolInfo['kind'], type: MeaoiuType, declarationNode: AST.AstNode) {
		if (this.currentScope.symbols.has(name)) {
			this.errors.push({
				message: `名字 '${name}' 已经被定义过了喵！`,
				line: declarationNode.line!,
				col: declarationNode.col!,
			});
			return;
		}
		this.currentScope.symbols.set(name, { name, kind, type, declarations: [declarationNode], references: [] });
	}
	private lookup(name: string): SymbolInfo | undefined {
		let s: Scope | undefined = this.currentScope;
		while (s) {
			if (s.symbols.has(name)) return s.symbols.get(name);
			s = s.parent;
		}
		return undefined;
	}
}

export function analyzeSymbols(
	ast: AST.Program,
	builtInNames: typeof builtInFunctionNames
): {
	rootScope: Scope;
	errors: SemanticError[];
	symbolMap: Map<AST.AstNode, SymbolInfo>;
	nodeScopeMap: Map<AST.AstNode, Scope>;
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
