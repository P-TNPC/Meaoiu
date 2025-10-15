// src/cli/tools/diagnoser.ts

import { formatError } from './toolUtils.js';
import { getDiagnostics } from '../../services/diagnostics.js';

export function diagnose(sourceCode: string, filePath: string): void {
	try {
		console.log(`[诊断器] 正在分析 ${filePath} ...`);

		const { syntaxErrors, semanticErrors } = getDiagnostics(sourceCode);

		const noErrorTypes = [
			{ type: '语法', errors: syntaxErrors },
			{ type: '语义', errors: semanticErrors },
		].reduce((acc, { type, errors }) => {
			if (!errors.length) return [...acc, type];
			console.log(`[诊断器] ❌ 发现了 ${errors.length} 个${type}问题:`);
			errors.forEach(e => console.error(`- [${e.line}:${e.col}] ${e.message}`));
			return acc;
		}, [] as string[]);

		if (noErrorTypes.length) console.log(`[诊断器] ✅ 未发现任何${noErrorTypes.join('或')}错误。`);
	} catch (e: any) {
		console.error(formatError(e, sourceCode, filePath));
	}
}
