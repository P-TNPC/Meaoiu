// src/api/services/completions.ts

import type * as AST from '../../core/ast.js';
import { sortedKeywords } from '../../core/tokenizer.js';
import type { ServiceState } from '../serviceState.js';
import { SymbolKind, type Scope } from '../utils/symbolTable.js';

// 找到指定位置所在的最小作用域
function findScopeAt(position: { line: number; col: number }, nodeScopeMap: Map<AST.Node, Scope>): Scope | undefined {
	const { line: targetLine, col: targetCol } = position;
	let bestFitNode: AST.Node | undefined;

	for (const node of nodeScopeMap.keys()) {
		const isOutsideOrOutter =
			targetLine < node.line ||
			targetLine > node.endLine ||
			(targetLine === node.line && targetCol < node.col) ||
			(targetLine === node.endLine && targetCol > node.endCol) ||
			(bestFitNode &&
				(node.line < bestFitNode.line ||
					node.endLine > bestFitNode.endLine ||
					(node.line === bestFitNode.line && node.col < bestFitNode.col) ||
					(node.endLine === bestFitNode.endLine && node.endCol > bestFitNode.endCol)));
		if (!isOutsideOrOutter) bestFitNode = node;
	}
	return bestFitNode ? nodeScopeMap.get(bestFitNode) : undefined;
}

export const enum SuggestionKind {
	FUNCTION = 3,
	VARIABLE = 6,
	KEYWORD = 14,
	REFERENCE = 18,
}
type Suggestion = { label: string; kind: SuggestionKind };

const suggestionKinds = {
	[SymbolKind.FUNCTION]: SuggestionKind.FUNCTION,
	[SymbolKind.VARIABLE]: SuggestionKind.VARIABLE,
	[SymbolKind.PARAMETER]: SuggestionKind.REFERENCE,
} as const satisfies Record<SymbolKind, SuggestionKind>;

// 获取一个作用域内所有可见的符号
function getVisibleSymbols(scope: Scope): Suggestion[] {
	const keys = new Set<string>();
	const symbols: Suggestion[] = [];
	for (let current: Scope | undefined = scope; current; current = current.parent) {
		current.symbols.forEach(({ name: label, kind }) => {
			const key = `${label}::${kind}`;
			if (keys.has(key)) return;
			keys.add(key);
			symbols.push({ label, kind: suggestionKinds[kind] });
		});
	}
	return symbols;
}

export function getCompletions(serviceState: ServiceState, position: { line: number; col: number }): Suggestion[] {
	const { rootScope, nodeScopeMap } = serviceState.analyzeResult;
	const currentScope = findScopeAt(position, nodeScopeMap) ?? rootScope;

	const symbolSuggestions = getVisibleSymbols(currentScope);
	const keywordSuggestions = sortedKeywords.map<Suggestion>(label => ({ label, kind: SuggestionKind.KEYWORD }));

	return [...symbolSuggestions, ...keywordSuggestions.reverse()];
}
