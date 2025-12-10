// src/core/ast.ts

import type { Token } from './tokenizer.js';

export const enum NodeType {
	// 节点
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
	ArithmeticExpression,
	CallExpression,
	SequenceExpression,
	LogicalExpression,
	ComparisonExpression,
	MemberAccessExpression,
	UnaryExpression,
}

export type Node = Statement | Expression | Program | ErrorNode;

// 允许的属性类型
type BaseType = string | number | boolean | null | undefined;
export type NodeValue = BaseType | Node | Node[] | Token[];

export interface AstNode<T extends NodeType = NodeType> {
	type: T;
	line: number;
	col: number;
	endLine: number;
	endCol: number;
	leadingComments?: Token[];
	trailingComments?: Token[];
	[key: string]: NodeValue;
}
export interface ErrorNode extends AstNode<NodeType.ErrorNode> {
	message: string;
}
export interface Program extends AstNode<NodeType.Program> {
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

export const enum AssignmentKind {
	REFERENCE,
	COPY,
	MOVE,
}
export type UnaryOperator = AssignmentKind.COPY | AssignmentKind.MOVE;

export const enum LogicalOperator {
	AND,
	OR,
	NAND,
	NOR,
}

export interface VariableDeclaration extends AstNode<NodeType.VariableDeclaration> {
	identifier: Identifier;
	initialization?: AssignmentStatement | undefined;
}

export interface AssignmentStatement extends AstNode<NodeType.AssignmentStatement> {
	assignee: Expression;
	kind: AssignmentKind;
	value: Expression;
}

export interface FunctionDeclaration extends AstNode<NodeType.FunctionDeclaration> {
	name: Identifier;
	params: BlockExpression;
	body: BlockExpression;
}

export interface ReturnStatement extends AstNode<NodeType.ReturnStatement> {
	argument?: Expression | undefined;
}

export interface AmbushStatement extends AstNode<NodeType.AmbushStatement> {
	argument?: Expression | undefined;
}

export interface BreakStatement extends AstNode<NodeType.BreakStatement> {
	// 只留名喵
}

export interface ExpressionStatement extends AstNode<NodeType.ExpressionStatement> {
	expression: Expression;
}

export interface NumericLiteral extends AstNode<NodeType.NumericLiteral> {
	value: number;
}

export interface StringLiteral extends AstNode<NodeType.StringLiteral> {
	value: string;
}

export interface BooleanLiteral extends AstNode<NodeType.BooleanLiteral> {
	value: boolean;
}

export interface NullLiteral extends AstNode<NodeType.NullLiteral> {
	value: null;
}

export interface Identifier extends AstNode<NodeType.Identifier> {
	symbol: string;
}

export interface BlockExpression extends AstNode<NodeType.BlockExpression> {
	body: Statement[];
	isCollection: boolean;
}

export interface IfExpression extends AstNode<NodeType.IfExpression> {
	test: Expression;
	consequent: BlockExpression;
	alternate?: BlockExpression | IfExpression | undefined;
}

export interface LoopExpression extends AstNode<NodeType.LoopExpression> {
	body: BlockExpression;
}

export interface CallExpression extends AstNode<NodeType.CallExpression> {
	callee: Identifier;
	args: Expression;
}

export interface MemberAccessExpression extends AstNode<NodeType.MemberAccessExpression> {
	object: Expression;
	property: Expression;
}

export interface UnaryExpression extends AstNode<NodeType.UnaryExpression> {
	operator: UnaryOperator;
	argument: Expression;
}

export interface ArithmeticExpression extends AstNode<NodeType.ArithmeticExpression> {
	left: Expression;
	right: Expression;
	operator: string;
}

export interface ComparisonExpression extends AstNode<NodeType.ComparisonExpression> {
	expressions: Expression[];
	operators: Token[];
}

export interface SequenceExpression extends AstNode<NodeType.SequenceExpression> {
	sections: Expression[];
	operators: Token[];
}

export interface LogicalExpression extends AstNode<NodeType.LogicalExpression> {
	left: Expression;
	right: Expression;
	operator: LogicalOperator;
}
