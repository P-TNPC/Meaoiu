// src/lsp-services/diagnostics.ts

import { tokenize } from '../core/tokenizer.js';
import { Parser } from '../core/parser.js';
import { formatError } from '../core/errorFormatter.js';
import { analyzeSymbols } from './symbolAnalyzer.js';
import { builtInFunctionNames } from '../core/builtIns.js';

export function diagnose(sourceCode: string, filePath: string): void {
	try {
		console.log(`[诊断器] 正在分析 ${filePath} ...`);

		// 1. 语法分析
		const tokens = tokenize(sourceCode, { ignoreComments: true });
		const parser = new Parser(tokens, 'tolerant');
		const { program: ast, errors: syntaxErrors } = parser.parse();

		// 2. 语义分析
		const { errors: semanticErrors } = analyzeSymbols(ast, builtInFunctionNames);

		const errors = [...syntaxErrors, ...semanticErrors];

		if (errors.length > 0) {
			console.log(`[诊断器] 发现了 ${errors.length} 个问题:`);
			for (const error of errors) {
				// 简单打印语法或语义错误
				console.error(`- [${error.line}:${error.col}] ${error.message}`);
			}
		} else {
			console.log(`[诊断器] ✅ 在 ${filePath} 中没有发现任何语法或语义错误。`);
		}
	} catch (e: any) {
		// 捕获语法错误
		console.error(formatError(e, sourceCode, filePath));
	}
}
