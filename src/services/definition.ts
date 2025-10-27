// src/services/definition.ts

import { tokenize } from '../core/tokenizer.js';
import { Parser } from '../core/parser.js';
import { analyzeSymbols } from './utils/symbolAnalyzer.js';
import { builtInFunctionNames } from '../core/builtIns.js';
import type { SymbolInfo } from './utils/symbolTable.js';
import { findIdentifierAt } from './utils/astUtils.js';

export function findDefinition(sourceCode: string, position: { line: number; col: number }): SymbolInfo | undefined {
	const parser = new Parser(tokenize(sourceCode, { ignoreComments: true }), 'tolerant');
	const { program: ast } = parser.parse();
	if (!ast) return;

	const identifierNode = findIdentifierAt(ast, position.line, position.col);
	if (!identifierNode) return;

	const { symbolMap } = analyzeSymbols(ast, builtInFunctionNames);
	return symbolMap.get(identifierNode);
}
