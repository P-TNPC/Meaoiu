// src/services/highlight.ts

import { tokenize } from '../core/tokenizer.js';
import { Parser } from '../core/parser.js';
import { analyzeSymbols } from './utils/symbolAnalyzer.js';
import { builtInFunctionNames } from '../core/builtIns.js';
import { buildParentMap } from './utils/astUtils.js';

type HighlightTokens = { line: number; col: number; length: number; tokenType: number; tokenModifiers: number }[];

// 定义语义 Token 图例
const tokenTypes = ['variable', 'parameter', 'function'];
const tokenModifiers = ['declaration', 'modification', 'defaultLibrary', 'deprecated'];
export const legend = { tokenTypes, tokenModifiers };

export function getHighlightTokens(sourceCode: string) {
	const highlightTokens: HighlightTokens = [];

	const { program: ast } = new Parser(tokenize(sourceCode, { ignoreComments: true }), 'tolerant').parse();
	const parentMap = buildParentMap(ast);

	const { symbolMap } = analyzeSymbols(ast, builtInFunctionNames);
	symbolMap.forEach(symbolInfo => {
		const typeIndex = tokenTypes.indexOf(symbolInfo.kind);
		if (typeIndex === -1) return;

		// 收集声明
		symbolInfo.declarations.forEach(dec => {
			const modifiers = [tokenModifiers.indexOf('declaration')];
			if (symbolInfo.isBuiltIn) modifiers.push(tokenModifiers.indexOf('defaultLibrary'));
			const modBitmask = modifiers.reduce((a, b) => a | (1 << b), 0);
			highlightTokens.push({
				line: dec.line - 1,
				col: dec.col - 1,
				length: symbolInfo.name.length,
				tokenType: typeIndex,
				tokenModifiers: modBitmask,
			});
		});

		// 收集引用
		symbolInfo.references.forEach(ref => {
			const modifiers = [];
			if (symbolInfo.isBuiltIn) modifiers.push(tokenModifiers.indexOf('defaultLibrary'));
			if (symbolInfo.isMoved) modifiers.push(tokenModifiers.indexOf('deprecated'));
			const parent = parentMap.get(ref);
			if (parent?.type === 'AssignmentStatement' && parent.assignee === ref) {
				modifiers.push(tokenModifiers.indexOf('modification'));
			}
			const modBitmask = modifiers.reduce((a, b) => a | (1 << b), 0);
			highlightTokens.push({
				line: ref.line - 1,
				col: ref.col - 1,
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
