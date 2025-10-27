// src/cli/tools/completer.ts

import { getCompletions, type SymbolKind } from '../../services/completions.js';
import { parsePosition } from './toolUtils.js';

export function complete(sourceCode: string, posRaw: string) {
	const pos = parsePosition(posRaw);

	const KINDS: SymbolKind[] = ['variable', 'function', 'parameter', 'keyword'] as const;
	const completions = getCompletions(sourceCode, pos);
	const suggestions = completions.reduce<Record<SymbolKind, string[]>>(
		(acc, { label, kind }) => {
			const k = KINDS.includes(kind) ? kind : 'variable';
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
