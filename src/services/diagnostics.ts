// src/services/diagnostics.ts

import { tokenize } from '../core/tokenizer.js';
import { Parser } from '../core/parser.js';
import { analyzeSymbols } from './utils/symbolAnalyzer.js';
import { builtInFunctionNames } from '../core/builtIns.js';

export function getDiagnostics(sourceCode: string) {
	const tokens = tokenize(sourceCode, { ignoreComments: true });
	const parser = new Parser(tokens, 'tolerant');
	const { program: ast, errors: syntaxErrors } = parser.parse();

	const { errors: semanticErrors } = analyzeSymbols(ast, builtInFunctionNames);

	return { syntaxErrors, semanticErrors };
}
