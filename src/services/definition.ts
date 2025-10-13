// src/services/definition.ts

import { tokenize } from '../core/tokenizer.js';
import { Parser } from '../core/parser.js';
import { analyzeSymbols } from './utils/symbolAnalyzer.js';
import { builtInFunctionNames } from '../core/builtIns.js';
import type { SymbolInfo } from './utils/symbolTable.js';
import { findIdentifierAt } from './utils/astUtils.js';

export function findDefinition(sourceCode: string, position: { line: number; col: number }): SymbolInfo | undefined {
	// Parser 现在以 'tolerant' 模式运行
	const parser = new Parser(tokenize(sourceCode, { ignoreComments: true }), 'tolerant');
	const { program: ast } = parser.parse();

	// 如果文件完全无法解析，AST 可能是空的
	if (!ast) return;

	const { symbolMap } = analyzeSymbols(ast, builtInFunctionNames);
	const identifierNode = findIdentifierAt(ast, position.line, position.col);
	if (!identifierNode) return;
	return symbolMap.get(identifierNode);
}
