// src/api/services/highlight.ts

import { NodeKind } from '../../core/ast.js';
import type { ServiceState } from '../serviceState.js';
import { buildParentMap } from '../utils/astUtils.js';
import { SymbolKind, SymbolTag } from '../utils/symbolTable.js';

export type HighlightToken = { line: number; col: number; length: number; tokenType: number; tokenModifiers: number };

// 定义语义 Token 图例
const tokenTypes = ['variable', 'parameter', 'function'];
const tokenModifiers = ['declaration', 'modification', 'defaultLibrary', 'deprecated'];
export const legend = { tokenTypes, tokenModifiers };

const tokenTypeIndexMap = {
	[SymbolKind.VARIABLE]: 0,
	[SymbolKind.PARAMETER]: 1,
	[SymbolKind.FUNCTION]: 2,
} as const satisfies Record<SymbolKind, number>;

export function getHighlightTokens(serviceState: ServiceState): HighlightToken[] {
	const highlightTokens: HighlightToken[] = [];

	const parentMap = buildParentMap(serviceState.parseResult.program);
	const { symbolMap } = serviceState.analyzeResult;

	const MASK_DECLARATION = 1 << tokenModifiers.indexOf('declaration');
	const MASK_MODIFICATION = 1 << tokenModifiers.indexOf('modification');
	const MASK_DEFAULT_LIBRARY = 1 << tokenModifiers.indexOf('defaultLibrary');
	const MASK_DEPRECATED = 1 << tokenModifiers.indexOf('deprecated');

	let needsSort = false,
		prevLine = -1,
		prevCol = -1;

	symbolMap.forEach((symbolInfo, node) => {
		if (node.kind !== NodeKind.Identifier) return;

		const { kind: symbolKind, tag: symbolTag, isBuiltIn, declarations } = symbolInfo;
		let modMask = -isBuiltIn & MASK_DEFAULT_LIBRARY;

		// 区分声明处与引用处
		if (declarations.includes(node)) modMask |= MASK_DECLARATION;
		else {
			if (symbolTag === SymbolTag.DECAYED) modMask |= MASK_DEPRECATED;
			const parent = parentMap.get(node);
			if (parent?.kind === NodeKind.AssignmentStatement && parent.assignee === node) modMask |= MASK_MODIFICATION;
		}

		const { line, col, symbol } = node;
		const tokenTypeIndex = tokenTypeIndexMap[symbolKind];
		highlightTokens.push({ line, col, length: symbol.length, tokenType: tokenTypeIndex, tokenModifiers: modMask });

		if (needsSort) return;
		needsSort = line < prevLine || (line === prevLine && col < prevCol);
		prevLine = line;
		prevCol = col;
	});

	// 按需排序
	return needsSort ? highlightTokens.sort((a, b) => a.line - b.line || a.col - b.col) : highlightTokens;
}
