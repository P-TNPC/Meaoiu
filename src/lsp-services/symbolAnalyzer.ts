import * as AST from '../core/ast.js';
import type { builtInFunctionNames } from '../core/builtIns.js';
import type { MeaoiuType, Scope, SymbolInfo } from './symbolTable.js';

interface SemanticError {
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
				return '摸数';
			case 'StringLiteral':
				return '闲话';
			case 'BooleanLiteral':
				return '好坏';
			case 'NullLiteral':
				return '空碗';
			case 'Identifier':
				return this.lookup(node.symbol)?.type ?? '不懂';
			case 'CallExpression': {
				const func = this.lookup(node.callee.symbol);
				if (func?.kind === 'function') return '不懂';
				return '不懂';
			}
			case 'BinaryExpression':
				const op = (node as AST.BinaryExpression).operator;
				if (['>', '<', '>=', '<=', '=='].includes(op)) return '好坏';
				if (['+', '-', '*', '/'].includes(op)) return '摸数';
				return '不懂';
			case 'LogicalExpression':
				return '好坏';
			case 'SequenceExpression':
				return '摸数';
			default:
				return '不懂';
		}
	}

	public visit(node: AST.AstNode | undefined) {
		if (!node) return;
		this.nodeScopeMap.set(node, this.currentScope);
		switch (node.type) {
			case 'Program':
			case 'BlockStatement':
				this.enterScope(); // 进入块时，创建新作用域
				(node as AST.BlockStatement).body.forEach((n) => this.visit(n));
				this.leaveScope(); // 离开块时，返回父作用域
				break;
			case 'IfStatement': {
				const n = node as AST.IfStatement;
				this.visit(n.test);
				this.visit(n.consequent);
				this.visit(n.alternate);
				break;
			}
			case 'LoopStatement':
				this.visit((node as AST.LoopStatement).body);
				break;
			case 'ReturnStatement':
				this.visit((node as AST.ReturnStatement).argument);
				break;
			case 'FunctionDeclaration':
				this.visitFunctionDeclaration(node as AST.FunctionDeclaration);
				break;
			case 'VariableDeclaration':
				this.visitVariableDeclaration(node as AST.VariableDeclaration);
				break;
			case 'AssignmentStatement':
				this.visitAssignmentStatement(node as AST.AssignmentStatement);
				break;
			case 'ExpressionStatement':
				this.visit((node as AST.ExpressionStatement).expression);
				break;
			case 'CallExpression': {
				const n = node as AST.CallExpression;
				n.args.forEach((arg) => this.visit(arg.expression));
				this.visit(n.callee);
				break;
			}
			case 'LogicalExpression':
			case 'BinaryExpression':
				this.visitBinaryExpression(node as AST.BinaryExpression);
				break;
			case 'SequenceExpression':
				(node as AST.SequenceExpression).sections.forEach((s) => this.visit(s));
				break;
			case 'Identifier':
				this.visitIdentifier(node as AST.Identifier);
				break;
			case 'ErrorNode':
				break;
			case 'NumericLiteral':
			case 'StringLiteral':
			case 'BooleanLiteral':
			case 'NullLiteral':
			case 'BreakStatement':
			case 'Argument':
				break;
			default:
				console.warn(`[SymbolAnalyzer] Unhandled node type: ${node.type}`);
		}
	}

	private visitFunctionDeclaration(node: AST.FunctionDeclaration) {
		// 为计谋本身声明类型：'计谋'
		this.declare(node.name.symbol, 'function', '计谋', node.name);
		this.enterScope();
		// 为所有贡品声明初始类型：'不懂'
		node.params.forEach((p) => this.declare(p.symbol, 'parameter', '不懂', p));
		this.visit(node.body);
		this.leaveScope();
	}

	private visitVariableDeclaration(node: AST.VariableDeclaration) {
		const inferredType = this.inferExpressionType(node.value);
		this.declare(node.identifier.symbol, 'variable', inferredType, node.identifier);
		this.visit(node.value);
		if (node.kind === 'Move' && node.value.type === 'Identifier') {
			this.markAsMoved((node.value as AST.Identifier).symbol);
		}
	}

	private visitAssignmentStatement(node: AST.AssignmentStatement) {
		this.visit(node.assignee);
		this.visit(node.value);
		if (node.kind === 'Move' && node.value.type === 'Identifier') {
			this.markAsMoved((node.value as AST.Identifier).symbol);
		}
	}

	private visitBinaryExpression(node: AST.BinaryExpression) {
		this.visit(node.left);
		this.visit(node.right);

		const leftType = this.inferExpressionType(node.left);
		const rightType = this.inferExpressionType(node.right);
		const op = node.operator;

		if (op === '+') {
			if (!((leftType === '摸数' && rightType === '摸数') || (leftType === '闲话' && rightType === '闲话'))) {
				this.errors.push({
					message: `'+' 操作符不能用于 '${leftType}' 和 '${rightType}' 之间喵!`,
					line: node.line!,
					col: node.col!,
				});
			}
		} else if (['-', '*', '/'].includes(op)) {
			if (leftType !== '摸数' || rightType !== '摸数') {
				this.errors.push({ message: `'${op}' 操作符只能用于两个 '摸数' 之间喵!`, line: node.line!, col: node.col! });
			}
		} else if (['>', '<', '>=', '<='].includes(op)) {
			if (leftType !== rightType || (leftType !== '摸数' && leftType !== '闲话')) {
				this.errors.push({
					message: `'${op}' 操作符只能用于同类型的 '摸数' 或 '闲话' 之间喵!`,
					line: node.line!,
					col: node.col!,
				});
			}
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
		} else {
			this.errors.push({ message: `找不到名字为 '${node.symbol}' 的变量或计谋喵！`, line: node.line!, col: node.col! });
		}
	}

	private markAsMoved(name: string) {
		const symbol = this.lookup(name);
		if (symbol) {
			symbol.isMoved = true;
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
			type: '计谋',
			declarations: [],
			references: [],
			isBuiltIn: true,
		});
	}
	const analyzer = new SymbolAnalyzer(rootScope);
	analyzer.visit(ast);
	return { rootScope, errors: analyzer.errors, symbolMap: analyzer.symbolMap, nodeScopeMap: analyzer.nodeScopeMap };
}
