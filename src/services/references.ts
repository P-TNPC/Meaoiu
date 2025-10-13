// src/services/references.ts

import { tokenize } from '../core/tokenizer.js';
import { Parser } from '../core/parser.js';
import { analyzeSymbols } from './utils/symbolAnalyzer.js';
import { builtInFunctionNames } from '../core/builtIns.js';
import { findIdentifierAt } from './utils/astUtils.js';
import * as AST from '../core/ast.js';

export function findReferences(sourceCode: string, position: { line: number; col: number }): AST.AstNode[] {
	const parser = new Parser(tokenize(sourceCode, { ignoreComments: true }), 'tolerant');
	const { program: ast } = parser.parse();
	if (!ast) return [];

	const { symbolMap } = analyzeSymbols(ast, builtInFunctionNames);
	const identifierNode = findIdentifierAt(ast, position.line, position.col);
	if (!identifierNode) return [];

	const symbolInfo = symbolMap.get(identifierNode);
	if (!symbolInfo) return [];

	return [...symbolInfo.declarations, ...symbolInfo.references];
}
