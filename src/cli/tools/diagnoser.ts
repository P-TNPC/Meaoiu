// src/cli/tools/diagnoser.ts

import { formatError } from './toolUtils.js';
import { getDiagnostics } from '../../services/diagnostics.js';

export function diagnose(sourceCode: string, filePath: string): void {
	try {
		console.log(`[诊断器] 正在分析 ${filePath} ...`);

		const { syntaxErrors, semanticErrors } = getDiagnostics(sourceCode);
		const errors = [...syntaxErrors, ...semanticErrors];

		if (errors.length === 0) {
			console.log(`[诊断器] ✅ 在 ${filePath} 中没有发现任何语法或语义错误。`);
			return;
		}
		console.log(`[诊断器] 发现了 ${errors.length} 个问题:`);
		for (const error of errors) console.error(`- [${error.line}:${error.col}] ${error.message}`);
	} catch (e: any) {
		console.error(formatError(e, sourceCode, filePath));
	}
}
