// src/services/highlight.ts

import { NodeType } from '../core/ast.js';
import { builtInFunctionNames } from '../core/builtIns.js';
import { Parser } from '../core/parser.js';
import { tokenize } from '../core/tokenizer.js';
import { buildParentMap } from './utils/astUtils.js';
import { analyzeSymbols } from './utils/symbolAnalyzer.js';
import { SymbolKind, SymbolTag } from './utils/symbolTable.js';

type HighlightTokens = { line: number; col: number; length: number; tokenType: number; tokenModifiers: number }[];

// 定义语义 Token 图例
const tokenTypes = ['variable', 'parameter', 'function'];
const tokenModifiers = ['declaration', 'modification', 'defaultLibrary', 'deprecated'];
export const legend = { tokenTypes, tokenModifiers };

const typeIndexMap = {
	[SymbolKind.VARIABLE]: 0,
	[SymbolKind.PARAMETER]: 1,
	[SymbolKind.FUNCTION]: 2,
} as const satisfies Record<SymbolKind, number>;

export function getHighlightTokens(sourceCode: string) {
	const highlightTokens: HighlightTokens = [];

	const { program: ast } = new Parser(tokenize(sourceCode, { ignoreComments: true }), 'tolerant').parse();
	const parentMap = buildParentMap(ast);

	const { symbolMap } = analyzeSymbols(ast, builtInFunctionNames);
	symbolMap.forEach(symbolInfo => {
		const typeIndex = typeIndexMap[symbolInfo.kind];
		if (typeIndex === undefined) return;

		// 收集声明
		symbolInfo.declarations.forEach(dec => {
			const modifiers = [tokenModifiers.indexOf('declaration')];
			if (symbolInfo.isBuiltIn) modifiers.push(tokenModifiers.indexOf('defaultLibrary'));
			const modBitmask = modifiers.reduce((a, b) => a | (1 << b), 0);
			highlightTokens.push({
				line: dec.line,
				col: dec.col,
				length: symbolInfo.name.length,
				tokenType: typeIndex,
				tokenModifiers: modBitmask,
			});
		});

		// 收集引用
		symbolInfo.references.forEach(ref => {
			const modifiers = [];
			if (symbolInfo.isBuiltIn) modifiers.push(tokenModifiers.indexOf('defaultLibrary'));
			if (symbolInfo.tag === SymbolTag.DECAYED) modifiers.push(tokenModifiers.indexOf('deprecated'));
			const parent = parentMap.get(ref);
			if (parent?.type === NodeType.AssignmentStatement && parent.assignee === ref) {
				modifiers.push(tokenModifiers.indexOf('modification'));
			}
			const modBitmask = modifiers.reduce((a, b) => a | (1 << b), 0);
			highlightTokens.push({
				line: ref.line,
				col: ref.col,
				length: ref.symbol.length,
				tokenType: typeIndex,
				tokenModifiers: modBitmask,
			});
		});
	});

	// 严格按照行列顺序，将收集到的 token 排序！
	return highlightTokens.sort((a, b) => {
		return a.line !== b.line ? a.line - b.line : a.col - b.col;
	});
}
