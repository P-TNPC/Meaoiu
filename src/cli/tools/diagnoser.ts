// src/cli/tools/diagnoser.ts

import { getDiagnostics, ServiceState } from '../../index.js';
import { formatError } from './toolUtils.js';

export function diagnose(sourceCode: string, filePath: string): void {
	console.log('-----------------------------');
	console.log(`[诊断器] 正在分析 ${filePath} ...`);
	console.log('-----------------------------');
	try {
		const { syntaxErrors, semanticErrors } = getDiagnostics(new ServiceState(0, sourceCode));

		const noErrorTypes = [
			{ type: '语法', errors: syntaxErrors },
			{ type: '语义', errors: semanticErrors },
		].reduce<string[]>((acc, { type, errors }) => {
			if (!errors.length) return [...acc, type];
			console.log(`[诊断器] ❌ 发现了 ${errors.length} 个${type}问题:`);
			for (const e of errors) console.error(`- ${e}`);
			return acc;
		}, []);

		if (noErrorTypes.length) console.log(`[诊断器] ✅ 未发现任何${noErrorTypes.join('或')}错误。`);
	} catch (err) {
		console.error('\n-----------------------------');
		console.error(formatError(err, sourceCode, filePath));
	}
	console.log('-----------------------------');
}
