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

	symbolMap.forEach(({ kind: symbolKind, tag: symbolTag, name: symbolName, isBuiltIn, declarations, references }) => {
		const tokenTypeIndex = tokenTypeIndexMap[symbolKind];

		// 收集声明
		for (const dec of declarations) {
			const modifiers = [tokenModifiers.indexOf('declaration')];
			if (isBuiltIn) modifiers.push(tokenModifiers.indexOf('defaultLibrary'));
			const modBitmask = modifiers.reduce((a, b) => a | (1 << b), 0);
			highlightTokens.push({
				line: dec.line,
				col: dec.col,
				length: symbolName.length,
				tokenType: tokenTypeIndex,
				tokenModifiers: modBitmask,
			});
		}

		// 收集引用
		for (const ref of references) {
			const modifiers: number[] = [];
			if (isBuiltIn) modifiers.push(tokenModifiers.indexOf('defaultLibrary'));
			if (symbolTag === SymbolTag.DECAYED) modifiers.push(tokenModifiers.indexOf('deprecated'));
			const parent = parentMap.get(ref);
			if (parent?.kind === NodeKind.AssignmentStatement && parent.assignee === ref) {
				modifiers.push(tokenModifiers.indexOf('modification'));
			}
			const modBitmask = modifiers.reduce((a, b) => a | (1 << b), 0);
			highlightTokens.push({
				line: ref.line,
				col: ref.col,
				length: ref.symbol.length,
				tokenType: tokenTypeIndex,
				tokenModifiers: modBitmask,
			});
		}
	});

	// 严格按照行列顺序，将收集到的 token 排序！
	return highlightTokens.sort((a, b) => {
		return a.line !== b.line ? a.line - b.line : a.col - b.col;
	});
}
