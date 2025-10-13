// src/services/completions.ts

import { tokenize, KEYWORDS } from '../core/tokenizer.js';
import { Parser } from '../core/parser.js';
import { builtInFunctionNames } from '../core/builtIns.js';
import * as AST from '../core/ast.js';
import { analyzeSymbols } from './utils/symbolAnalyzer.js';
import type { Scope } from './utils/symbolTable.js';

// 找到指定位置所在的最小作用域
function findScopeAt(
	_ast: AST.AstNode,
	position: { line: number; col: number },
	nodeScopeMap: Map<AST.AstNode, Scope>
): Scope | undefined {
	let bestFitNode: AST.AstNode | undefined;

	for (const node of nodeScopeMap.keys()) {
		if (!node.line || !node.col || !node.endLine || !node.endCol) continue;

		const isInside =
			(position.line > node.line || (position.line === node.line && position.col >= node.col)) &&
			(position.line < node.endLine || (position.line === node.endLine && position.col <= node.endCol));

		if (isInside) {
			if (
				!bestFitNode ||
				(node.line >= bestFitNode.line! &&
					node.endLine <= bestFitNode.endLine! &&
					node.endCol! - node.col <= bestFitNode.endCol! - bestFitNode.col!)
			) {
				bestFitNode = node;
			}
		}
	}
	return bestFitNode ? nodeScopeMap.get(bestFitNode) : undefined;
}

// 获取一个作用域内所有可见的符号
function getVisibleSymbols(scope: Scope): string[] {
	const symbols = new Set<string>();
	let current: Scope | undefined = scope;
	while (current) {
		current.symbols.forEach((symbol) => symbols.add(symbol.name));
		current = current.parent;
	}
	return Array.from(symbols);
}

// 主服务函数
export function getCompletions(sourceCode: string, position: { line: number; col: number }): { label: string; kind: string }[] {
	const tokens = tokenize(sourceCode, { ignoreComments: true });
	const parser = new Parser(tokens, 'tolerant');
	const { program: ast } = parser.parse();

	const { rootScope, nodeScopeMap } = analyzeSymbols(ast, builtInFunctionNames);
	const currentScope = findScopeAt(ast, position, nodeScopeMap) ?? rootScope;
	const visibleSymbols = getVisibleSymbols(currentScope);

	const keywordSuggestions = Object.keys(KEYWORDS).map((k) => ({ label: k, kind: 'keyword' }));
	const symbolSuggestions = visibleSymbols.map((s) => ({ label: s, kind: 'variable' }));

	return [...symbolSuggestions, ...keywordSuggestions];
}
