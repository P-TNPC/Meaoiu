// src/cli/tools/completer.ts

import { getCompletions } from '../../services/completions.js';
import { parsePosition } from './toolUtils.js';

type Kind = 'variable' | 'function' | 'parameter' | 'keyword';
export function complete(sourceCode: string, posRaw: string) {
	const pos = parsePosition(posRaw);
	if (!pos) {
		console.error("位置参数格式错误，应为 '行:列'，例如 '2:3'");
		return;
	}

	const completions = getCompletions(sourceCode, pos);
	const suggestions = completions.reduce(
		(acc, { label, kind }) => {
			const k = ['variable', 'function', 'parameter', 'keyword'].includes(kind) ? (kind as Kind) : 'variable';
			acc[k].push(label);
			return acc;
		},
		{ variable: [], function: [], parameter: [], keyword: [] } as Record<Kind, string[]>
	);

	console.log(`[自动补全] 在位置 ${pos.line}:${pos.col} 的建议:`);
	if (suggestions.keyword.length) console.log('- 关键字>', suggestions.keyword.join(', '));
	if (suggestions.parameter.length) console.log('- 参数>', suggestions.parameter.join(', '));
	if (suggestions.function.length) console.log('- 函数>', suggestions.function.join(', '));
	if (suggestions.variable.length) console.log('- 变量>', suggestions.variable.join(', '));
}
