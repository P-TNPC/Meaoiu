// src/core/ast.ts

import type { ArithmeticTokenKind, ComparisonTokenKind, EqualityTokenKind, Token, TokenKind } from './lexer/tokenizer.js';

export const enum NodeKind {
	// 特例
	ErrorNode,
	Program,

	// 语句
	VariableDeclaration,
	AssignmentStatement,
	FunctionDeclaration,
	ReturnStatement,
	AmbushStatement,
	BreakStatement,
	ExpressionStatement,

	// 表达式
	NumericLiteral,
	StringLiteral,
	BooleanLiteral,
	NullLiteral,
	Identifier,
	BlockExpression,
	IfExpression,
	LoopExpression,
	CallExpression,
	MemberAccessExpression,
	UnaryExpression,
	ArithmeticExpression,
	ComparisonExpression,
	SequenceExpression,
	LogicalExpression,
}

export type Node = Statement | Expression | Program | ErrorNode;

// 允许的属性类型
// type BaseType = string | number | boolean | null | undefined;
// type NodeValue = BaseType | Node | Node[] | Token[];

export interface AstNode<T extends NodeKind = NodeKind> {
	kind: T;
	line: number;
	col: number;
	endLine: number;
	endCol: number;
	leadingComments?: Token[];
	trailingComments?: Token[];
	// [key: string]: NodeValue;
}
export interface ErrorNode extends AstNode<NodeKind.ErrorNode> {
	message: string;
}
export interface Program extends AstNode<NodeKind.Program> {
	body: Statement[];
}

export type Statement =
	| VariableDeclaration
	| AssignmentStatement
	| FunctionDeclaration
	| ReturnStatement
	| AmbushStatement
	| BreakStatement
	| ExpressionStatement
	| ErrorNode;

export type Expression =
	| NumericLiteral
	| StringLiteral
	| BooleanLiteral
	| NullLiteral
	| Identifier
	| BlockExpression
	| IfExpression
	| LoopExpression
	| CallExpression
	| MemberAccessExpression
	| UnaryExpression
	| ArithmeticExpression
	| ComparisonExpression
	| SequenceExpression
	| LogicalExpression
	| ErrorNode;

type UnaryOperator = TokenKind.ASSIGNMENT_LIKE | TokenKind.ASSIGNMENT_ONLY;
type AssignmentOperator = TokenKind.ASSIGNMENT_IS | UnaryOperator;
type LogicalOperator =
	| TokenKind.LOGIC_CLOSE_AND
	| TokenKind.LOGIC_CLOSE_OR
	| TokenKind.LOGIC_CLOSE_NAND
	| TokenKind.LOGIC_CLOSE_NOR;

export interface VariableDeclaration extends AstNode<NodeKind.VariableDeclaration> {
	identifier: Identifier;
	initialization: AssignmentStatement | undefined;
}

export interface AssignmentStatement extends AstNode<NodeKind.AssignmentStatement> {
	assignee: Expression;
	operator: AssignmentOperator;
	value: Expression;
}

export interface FunctionDeclaration extends AstNode<NodeKind.FunctionDeclaration> {
	name: Identifier;
	parameters: BlockExpression;
	body: BlockExpression;
}

export interface ReturnStatement extends AstNode<NodeKind.ReturnStatement> {
	argument: Expression | undefined;
}

export interface AmbushStatement extends AstNode<NodeKind.AmbushStatement> {
	argument: Expression | undefined;
}

export interface BreakStatement extends AstNode<NodeKind.BreakStatement> {
	// 只留名喵
}

export interface ExpressionStatement extends AstNode<NodeKind.ExpressionStatement> {
	expression: Expression;
}

export interface NumericLiteral extends AstNode<NodeKind.NumericLiteral> {
	value: number;
}

export interface StringLiteral extends AstNode<NodeKind.StringLiteral> {
	value: string;
}

export interface BooleanLiteral extends AstNode<NodeKind.BooleanLiteral> {
	value: boolean;
}

export interface NullLiteral extends AstNode<NodeKind.NullLiteral> {
	value: null;
}

export interface Identifier extends AstNode<NodeKind.Identifier> {
	symbol: string;
}

export interface BlockExpression extends AstNode<NodeKind.BlockExpression> {
	body: Statement[];
	isCollection: boolean;
}

export interface IfExpression extends AstNode<NodeKind.IfExpression> {
	condition: Expression;
	consequent: BlockExpression;
	alternate: BlockExpression | IfExpression | undefined;
}

export interface LoopExpression extends AstNode<NodeKind.LoopExpression> {
	body: BlockExpression;
}

export interface CallExpression extends AstNode<NodeKind.CallExpression> {
	callee: Identifier;
	args: Expression;
}

export interface MemberAccessExpression extends AstNode<NodeKind.MemberAccessExpression> {
	object: Expression;
	property: Expression;
}

export interface UnaryExpression extends AstNode<NodeKind.UnaryExpression> {
	operator: UnaryOperator;
	argument: Expression;
}

export interface ArithmeticExpression extends AstNode<NodeKind.ArithmeticExpression> {
	left: Expression;
	right: Expression;
	operator: Token<ArithmeticTokenKind>;
}

export interface ComparisonExpression extends AstNode<NodeKind.ComparisonExpression> {
	expressions: Expression[];
	operators: Token<ComparisonTokenKind>[];
}

export interface SequenceExpression extends AstNode<NodeKind.SequenceExpression> {
	sections: Expression[];
	operators: Token<ArithmeticTokenKind | EqualityTokenKind>[];
}

export interface LogicalExpression extends AstNode<NodeKind.LogicalExpression> {
	left: Expression;
	right: Expression;
	operator: LogicalOperator;
}
