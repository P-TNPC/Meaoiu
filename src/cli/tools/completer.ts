// src/cli/tools/completer.ts

import { getCompletions, SuggestionKind } from '../../api/services/completions.js';
import { ServiceState } from '../../api/serviceState.js';
import { parsePosition } from './toolUtils.js';

export function complete(sourceCode: string, posRaw?: string) {
	const pos = parsePosition(posRaw);

	type KindString = 'variable' | 'function' | 'parameter' | 'keyword';
	const kindMap: Record<SuggestionKind, KindString> = {
		[SuggestionKind.FUNCTION]: 'function',
		[SuggestionKind.VARIABLE]: 'variable',
		[SuggestionKind.KEYWORD]: 'keyword',
		[SuggestionKind.REFERENCE]: 'parameter',
	};

	const completions = getCompletions(new ServiceState(0, sourceCode), pos);
	const suggestions = completions.reduce<Record<KindString, string[]>>(
		(acc, { label, kind }) => {
			const k = kindMap[kind] ?? 'variable';
			acc[k].push(label);
			return acc;
		},
		{ variable: [], function: [], parameter: [], keyword: [] }
	);

	console.log(`[自动补全] 在位置 ${pos.line}:${pos.col} 的建议:`);
	suggestions.keyword.length && console.log('- 关键字>', suggestions.keyword.join(', '));
	suggestions.parameter.length && console.log('- 参数>', suggestions.parameter.join(', '));
	suggestions.function.length && console.log('- 函数>', suggestions.function.join(', '));
	suggestions.variable.length && console.log('- 变量>', suggestions.variable.join(', '));
}
