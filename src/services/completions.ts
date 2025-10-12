// src/lsp-services/completions.ts

import { tokenize, KEYWORDS } from '../core/tokenizer.js';
import { Parser } from '../core/parser.js';
import { analyzeSymbols } from './symbolAnalyzer.js';
import { builtInFunctionNames } from '../core/builtIns.js';
import * as AST from '../core/ast.js';
import type { Scope } from './symbolTable.js';

// 辅助计谋：找到指定位置所在的最小作用域
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

// 辅助计谋：获取一个作用域内所有可见的符号
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
	// 不再需要 try-catch，因为宽容的 Parser 会处理所有语法错误
	const tokens = tokenize(sourceCode, { ignoreComments: true });
	// 1. 以“宽容模式”创建并运行 Parser
	const parser = new Parser(tokens, 'tolerant');
	const { program: ast } = parser.parse(); // 我们可以忽略错误，尽力获取一个（可能不完整的）AST

	// 2. 即使 AST 不完整，我们仍然尽力进行符号分析和补全
	const { rootScope, nodeScopeMap } = analyzeSymbols(ast, builtInFunctionNames);
	const currentScope = findScopeAt(ast, position, nodeScopeMap) ?? rootScope;
	const visibleSymbols = getVisibleSymbols(currentScope);

	const keywordSuggestions = Object.keys(KEYWORDS).map((k) => ({ label: k, kind: 'keyword' }));
	const symbolSuggestions = visibleSymbols.map((s) => ({ label: s, kind: 'variable' }));

	return [...symbolSuggestions, ...keywordSuggestions];
}
