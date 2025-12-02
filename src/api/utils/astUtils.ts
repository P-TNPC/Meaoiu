// src/api/utils/astUtils.ts

import type * as AST from '../../core/ast.js';
import { NodeType } from '../../core/ast.js';
import type { Token } from '../../core/tokenizer.js';

export function isNodeArray(array: AST.Node[] | Token[]): array is AST.Node[] {
	return !!array[0] && 'endLine' in array[0];
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

		if (node.type === NodeType.Identifier && node.line === line && node.col <= col && col < node.endCol) {
			found = node;
			return;
		}

		// 递归遍历所有子节点
		for (const key in node) {
			const value = node[key];
			if (typeof value !== 'object' || !value) continue;
			if (!Array.isArray(value)) walk(value);
			else if (isNodeArray(value)) value.forEach(child => walk(child));
		}
	}
	walk(ast);

	return found;
}

export function buildParentMap(node: AST.Node) {
	const parentMap = new WeakMap<AST.Node, AST.Node>();
	function build(node: AST.Node, parent?: AST.Node) {
		if (parent) parentMap.set(node, parent);

		for (const key in node) {
			const value = node[key];
			if (typeof value !== 'object' || !value) continue;
			if (!Array.isArray(value)) build(value, node);
			else if (isNodeArray(value)) value.forEach(child => build(child, node));
		}
	}
	build(node);

	return parentMap;
}
