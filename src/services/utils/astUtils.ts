// src/services/utils/astUtils.ts

import type * as AST from '../../core/ast.js';

/**
 * 在 AST 中，根据给定的行和列，查找对应的标识符节点
 * @param ast 要遍历的 AST 根节点
 * @param line 行号 (1-based)
 * @param col 列号 (1-based)
 */
export function findIdentifierAt(ast: AST.AstNode, line: number, col: number): AST.Identifier | undefined {
	let found: AST.Identifier | undefined;

	function walk(node: AST.AstNode | undefined) {
		if (!node || found) return;

		// 检查当前节点是否是我们要找的目标
		if (node.type === 'Identifier') {
			const idNode = node as AST.Identifier;
			const startCol = idNode.col!;
			// 范围是左闭右开的，例如 col 6 覆盖了 'a'，但 col 7 就不在 'a' 上了
			const endCol = startCol + idNode.symbol.length;

			if (idNode.line === line && col >= startCol && col < endCol) {
				found = idNode;
				return;
			}
		}

		// 递归遍历所有子节点
		for (const key in node) {
			if (key === 'line' || key === 'col' || key === 'endLine' || key === 'endCol') continue;

			const value = (node as any)[key];
			if (Array.isArray(value)) value.forEach(child => walk(child));
			else if (value?.type && typeof value === 'object') walk(value);
		}
	}

	walk(ast);
	return found;
}
