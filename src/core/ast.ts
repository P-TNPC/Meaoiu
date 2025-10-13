// src/core/ast.ts

import type { Token } from './tokenizer.js';

export interface AstNode {
	type: string;
	line?: number | undefined;
	col?: number | undefined;
	endLine?: number | undefined;
	endCol?: number | undefined;
	leadingComments?: Token[];
	trailingComments?: Token[];
}
export interface ErrorNode extends AstNode {
	type: 'ErrorNode';
	message: string;
}
export interface Program extends AstNode {
	type: 'Program';
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
	| ErrorNode;

export type LogicalOperator = 'AND' | 'OR' | 'NAND' | 'NOR';

export interface LogicalExpression extends AstNode {
	type: 'LogicalExpression';
	left: Expression;
	right: Expression;
	operator: LogicalOperator;
}

export interface SequenceExpression extends AstNode {
	type: 'SequenceExpression';
	sections: Expression[];
	operators: Token[];
}

export interface AssignmentStatement extends AstNode {
	type: 'AssignmentStatement';
	assignee: Identifier;
	value: Expression;
	kind: 'Move' | 'Copy';
}

export interface VariableDeclaration extends AstNode {
	type: 'VariableDeclaration';
	kind: 'Move' | 'Copy';
	identifier: Identifier;
	value: Expression;
}

export interface FunctionDeclaration extends AstNode {
	type: 'FunctionDeclaration';
	name: Identifier;
	params: Identifier[];
	body: BlockStatement;
}

export interface IfStatement extends AstNode {
	type: 'IfStatement';
	test: Expression;
	consequent: BlockStatement;
	alternate?: Statement | undefined;
}

export interface LoopStatement extends AstNode {
	type: 'LoopStatement';
	body: BlockStatement;
}

export interface BlockStatement extends AstNode {
	type: 'BlockStatement';
	body: Statement[];
}

export interface BreakStatement extends AstNode {
	type: 'BreakStatement';
}

export interface NumericLiteral extends AstNode {
	type: 'NumericLiteral';
	value: number;
}

export interface StringLiteral extends AstNode {
	type: 'StringLiteral';
	value: string;
}

export interface BooleanLiteral extends AstNode {
	type: 'BooleanLiteral';
	value: boolean;
}

export interface NullLiteral extends AstNode {
	type: 'NullLiteral';
	value: null;
}

export interface Identifier extends AstNode {
	type: 'Identifier';
	symbol: string;
}

export interface BinaryExpression extends AstNode {
	type: 'BinaryExpression';
	left: Expression;
	operator: string;
	right: Expression;
}

export interface CallExpression extends AstNode {
	type: 'CallExpression';
	callee: Identifier;
	args: Argument[];
}

export interface ReturnStatement extends AstNode {
	type: 'ReturnStatement';
	argument?: Expression | undefined;
}

export interface Argument extends AstNode {
	type: 'Argument';
	expression: Expression;
	isClone: boolean;
}

export interface ExpressionStatement extends AstNode {
	type: 'ExpressionStatement';
	expression: Expression;
}
