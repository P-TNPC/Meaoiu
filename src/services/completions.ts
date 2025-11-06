// src/services/completions.ts

import { tokenize, sortedKeywords } from '../core/tokenizer.js';
import { Parser } from '../core/parser.js';
import { builtInFunctionNames } from '../core/builtIns.js';
import type * as AST from '../core/ast.js';
import { analyzeSymbols } from './utils/symbolAnalyzer.js';
import type { Scope, SymbolInfo } from './utils/symbolTable.js';

// 找到指定位置所在的最小作用域
function findScopeAt(position: { line: number; col: number }, nodeScopeMap: Map<AST.Node, Scope>): Scope | undefined {
	let bestFitNode: AST.Node | undefined;

	for (const node of nodeScopeMap.keys()) {
		const isInside =
			(position.line > node.line || (position.line === node.line && position.col >= node.col)) &&
			(position.line < node.endLine || (position.line === node.endLine && position.col <= node.endCol));
		if (!isInside) continue;

		if (
			!bestFitNode ||
			(node.line >= bestFitNode.line &&
				node.endLine <= bestFitNode.endLine &&
				node.endCol - node.col <= bestFitNode.endCol - bestFitNode.col)
		) {
			bestFitNode = node;
		}
	}
	return bestFitNode ? nodeScopeMap.get(bestFitNode) : undefined;
}

export type SymbolKind = SymbolInfo['kind'] | 'keyword';
export type Suggestion = { label: string; kind: SymbolKind };
// 获取一个作用域内所有可见的符号
function getVisibleSymbols(scope: Scope): Suggestion[] {
	const keys = new Set<string>();
	const symbols: Suggestion[] = [];
	let current: Scope | undefined = scope;
	while (current) {
		current.symbols.forEach(symbol => {
			const key = `${symbol.name}\n:${symbol.kind}`;
			if (!keys.has(key)) {
				keys.add(key);
				symbols.push({ label: symbol.name, kind: symbol.kind });
			}
		});
		current = current.parent;
	}
	return symbols;
}

// 主服务函数
export function getCompletions(sourceCode: string, position: { line: number; col: number }): Suggestion[] {
	const tokens = tokenize(sourceCode, { ignoreComments: true });
	const parser = new Parser(tokens, 'tolerant');
	const { program: ast } = parser.parse();

	const { rootScope, nodeScopeMap } = analyzeSymbols(ast, builtInFunctionNames);
	const currentScope = findScopeAt(position, nodeScopeMap) ?? rootScope;

	const symbolSuggestions = getVisibleSymbols(currentScope);
	const keywordSuggestions = sortedKeywords.map<Suggestion>(k => ({ label: k, kind: 'keyword' }));

	return [...symbolSuggestions, ...keywordSuggestions.reverse()];
}
