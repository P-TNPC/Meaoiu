// src/core/ast.ts

import type { Token } from './tokenizer.js';

export type Node = Statement | Expression | Program | ErrorNode;

export interface AstNode<T extends string = string> {
	type: T;
	line?: number | undefined;
	col?: number | undefined;
	endLine?: number | undefined;
	endCol?: number | undefined;
	leadingComments?: Token[];
	trailingComments?: Token[];
}
export interface ErrorNode extends AstNode<'ErrorNode'> {
	message: string;
}
export interface Program extends AstNode<'Program'> {
	body: Statement[];
}

export type Statement =
	| VariableDeclaration
	| FunctionDeclaration
	| IfStatement
	| LoopStatement
	| BreakStatement
	| CallExpression
	| AssignmentStatement
	| BlockStatement
	| ReturnStatement
	| AmbushStatement
	| ExpressionStatement
	| ErrorNode;

export type Expression =
	| NumericLiteral
	| StringLiteral
	| BooleanLiteral
	| NullLiteral
	| Identifier
	| BinaryExpression
	| CallExpression
	| SequenceExpression
	| LogicalExpression
	| BlockStatement
	| IfStatement
	| LoopStatement
	| MemberAccessExpression
	| UnaryExpression
	| ErrorNode;

export type UnaryOperator = 'Copy' | 'Move';
export type AssignmentKind = 'Reference' | UnaryOperator;
export type LogicalOperator = 'AND' | 'OR' | 'NAND' | 'NOR';

export interface UnaryExpression extends AstNode<'UnaryExpression'> {
	operator: UnaryOperator;
	argument: Expression;
}

export interface LogicalExpression extends AstNode<'LogicalExpression'> {
	left: Expression;
	right: Expression;
	operator: LogicalOperator;
}

export interface SequenceExpression extends AstNode<'SequenceExpression'> {
	sections: Expression[];
	operators: Token[];
}

export interface VariableDeclaration extends AstNode<'VariableDeclaration'> {
	identifier: Identifier;
	initialization?: AssignmentStatement | undefined;
}

export interface AssignmentStatement extends AstNode<'AssignmentStatement'> {
	assignee: Expression;
	kind: AssignmentKind;
	value: Expression;
}

export interface BlockStatement extends AstNode<'BlockStatement'> {
	body: Statement[];
	isCollection?: boolean;
}

export interface MemberAccessExpression extends AstNode<'MemberAccessExpression'> {
	object: Expression;
	property: Expression;
}

export interface CallExpression extends AstNode<'CallExpression'> {
	callee: Identifier;
	args: Expression;
}

export interface ReturnStatement extends AstNode<'ReturnStatement'> {
	argument?: Expression | undefined;
}

export interface FunctionDeclaration extends AstNode<'FunctionDeclaration'> {
	name: Identifier;
	params: BlockStatement;
	body: BlockStatement;
}

export interface IfStatement extends AstNode<'IfStatement'> {
	test: Expression;
	consequent: BlockStatement;
	alternate?: Statement | undefined;
}

export interface LoopStatement extends AstNode<'LoopStatement'> {
	body: BlockStatement;
}

export interface AmbushStatement extends AstNode<'AmbushStatement'> {
	argument?: Expression | undefined;
}

export interface BreakStatement extends AstNode<'BreakStatement'> {
	// type: 'BreakStatement';
}

export interface NumericLiteral extends AstNode<'NumericLiteral'> {
	value: number;
}

export interface StringLiteral extends AstNode<'StringLiteral'> {
	value: string;
}

export interface BooleanLiteral extends AstNode<'BooleanLiteral'> {
	value: boolean;
}

export interface NullLiteral extends AstNode<'NullLiteral'> {
	value: null;
}

export interface Identifier extends AstNode<'Identifier'> {
	symbol: string;
}

export interface BinaryExpression extends AstNode<'BinaryExpression'> {
	left: Expression;
	right: Expression;
	operator: string;
}

export interface ExpressionStatement extends AstNode<'ExpressionStatement'> {
	expression: Expression;
}
