// src/api/services/completions.ts

import type * as AST from '../../core/ast.js';
import { sortedKeywords } from '../../core/lexer/tokenizer.js';
import type { ServiceState } from '../serviceState.js';
import type { Position } from '../utils/lspUtils.js';
import { SymbolKind, type Scope } from '../utils/symbolTable.js';

// 找到指定位置所在的最小作用域
function findScopeAt(
	{ line: targetLine, character: targetCol }: Position,
	nodeScopeMap: Map<AST.Node, Scope>,
): Scope | undefined {
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

// 获取一个作用域内所有可见的符号建议
function getSymbolSuggestions(scope: Scope): Suggestion[] {
	const keys = new Set<string>();
	const suggestions: Suggestion[] = [];
	for (let current: Scope | undefined = scope; current; current = current.parent) {
		current.symbols.forEach(({ name: label, kind }) => {
			const key = `${label}\0${kind}`;
			if (keys.has(key)) return;
			keys.add(key);
			suggestions.push({ label, kind: suggestionKinds[kind] });
		});
	}
	return suggestions;
}

export function getCompletions(serviceState: ServiceState, position: Position): Suggestion[] {
	const { rootScope, nodeScopeMap } = serviceState.analyzeResult;
	const currentScope = findScopeAt(position, nodeScopeMap) ?? rootScope;

	const symbolSuggestions = getSymbolSuggestions(currentScope);
	const keywordSuggestions = sortedKeywords.map<Suggestion>(label => ({ label, kind: SuggestionKind.KEYWORD }));

	return [...symbolSuggestions, ...keywordSuggestions.reverse()];
}
