// src/api/utils/astUtils.ts

import type * as AST from '../../core/ast.js';
import { NodeKind } from '../../core/ast.js';

export function forEachChild(node: AST.Node, action: (child: AST.Node) => void): void {
	switch (node.kind) {
		case NodeKind.Program:
		case NodeKind.BlockExpression:
			node.body.forEach(action);
			break;
		case NodeKind.VariableDeclaration:
			action(node.identifier);
			if (node.initialization) action(node.initialization);
			break;
		case NodeKind.AssignmentStatement:
			action(node.assignee);
			action(node.value);
			break;
		case NodeKind.FunctionDeclaration:
			action(node.name);
			action(node.parameters);
			action(node.body);
			break;
		case NodeKind.ReturnStatement:
		case NodeKind.AmbushStatement:
			if (node.argument) action(node.argument);
			break;
		case NodeKind.ExpressionStatement:
			action(node.expression);
			break;
		case NodeKind.IfExpression:
			action(node.condition);
			action(node.consequent);
			if (node.alternate) action(node.alternate);
			break;
		case NodeKind.LoopExpression:
			action(node.body);
			break;
		case NodeKind.CallExpression:
			action(node.callee);
			action(node.args);
			break;
		case NodeKind.MemberAccessExpression:
			action(node.object);
			action(node.property);
			break;
		case NodeKind.UnaryExpression:
			action(node.argument);
			break;
		case NodeKind.ArithmeticExpression:
		case NodeKind.LogicalExpression:
			action(node.left);
			action(node.right);
			break;
		case NodeKind.ComparisonExpression:
			node.expressions.forEach(action);
			break;
		case NodeKind.SequenceExpression:
			node.sections.forEach(action);
			break;
		case NodeKind.BreakStatement:
		case NodeKind.NumericLiteral:
		case NodeKind.StringLiteral:
		case NodeKind.BooleanLiteral:
		case NodeKind.NullLiteral:
		case NodeKind.Identifier:
		case NodeKind.ErrorNode:
			break;
		default: {
			const _n: never = node;
			console.error(`未识别的节点: ${_n}`);
		}
	}
}

/**
 * 在 AST 中，根据给定的行和列，查找对应的标识符节点
 * @param ast 要遍历的 AST 根节点
 * @param line 行号
 * @param col 列号
 */
export function findIdentifierAt(ast: AST.Node, line: number, col: number): AST.Identifier | undefined {
	let found: AST.Identifier | undefined;

	function walk(node: AST.Node) {
		if (found) return;

		if (node.kind === NodeKind.Identifier && node.line === line && node.col <= col && col < node.endCol) {
			found = node;
			return;
		}

		// 递归遍历所有子节点
		forEachChild(node, walk);
	}
	walk(ast);

	return found;
}

export function buildParentMap(node: AST.Node): WeakMap<AST.Node, AST.Node> {
	const parentMap = new WeakMap<AST.Node, AST.Node>();
	function build(node: AST.Node, parent?: AST.Node) {
		if (parent) parentMap.set(node, parent);
		forEachChild(node, child => build(child, node));
	}
	build(node);

	return parentMap;
}
