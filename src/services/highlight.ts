// src/services/highlight.ts

import type * as AST from '../core/ast.js';
import { tokenize } from '../core/tokenizer.js';
import { Parser } from '../core/parser.js';
import { analyzeSymbols } from './utils/symbolAnalyzer.js';
import { builtInFunctionNames } from '../core/builtIns.js';

type HighlightTokens = { line: number; col: number; length: number; tokenType: number; tokenModifiers: number }[];

// 定义语义 Token 图例
const tokenTypes = ['variable', 'parameter', 'function'];
const tokenModifiers = ['declaration', 'modification', 'defaultLibrary', 'deprecated'];
export const legend = { tokenTypes, tokenModifiers };

export function getHighlightTokens(sourceCode: string) {
	const highlightTokens: HighlightTokens = [];

	const { program: ast } = new Parser(tokenize(sourceCode, { ignoreComments: true }), 'tolerant').parse();
	const { symbolMap } = analyzeSymbols(ast, builtInFunctionNames);
	const parentMap = new Map<AST.Node, AST.Node>();
	function buildParentMap(node: AST.Node, parent?: AST.Node) {
		if (parent) parentMap.set(node, parent);

		for (const key in node) {
			const value = (node as any)[key];
			if (Array.isArray(value)) value.forEach(child => buildParentMap(child, node));
			else if (value?.type) buildParentMap(value, node);
		}
	}
	buildParentMap(ast);

	symbolMap.forEach(symbolInfo => {
		const typeIndex = tokenTypes.indexOf(symbolInfo.kind);
		if (typeIndex === -1) return;

		// 收集声明
		symbolInfo.declarations.forEach(dec => {
			const modifiers = [tokenModifiers.indexOf('declaration')];
			if (symbolInfo.isBuiltIn) modifiers.push(tokenModifiers.indexOf('defaultLibrary'));
			const modBitmask = modifiers.reduce((a, b) => a | (1 << b), 0);
			highlightTokens.push({
				line: dec.line! - 1,
				col: dec.col! - 1,
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
				line: ref.line! - 1,
				col: ref.col! - 1,
				length: (ref as AST.Identifier).symbol.length,
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
