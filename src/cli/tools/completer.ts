// src/cli/tools/completer.ts

import { getCompletions } from "../../services/completions.js";
import { parsePosition } from "./toolUtils.js";

export function complete(sourceCode: string, posRaw: string) {
	const pos = parsePosition(posRaw);
	if (!pos) {
		console.error("位置参数格式错误，应为 '行:列'，例如 '2:3'");
		return;
	}
	const completions = getCompletions(sourceCode, pos);
	const keywords = completions.filter(c => c.kind === 'keyword').map(c => c.label);
	const variables = completions.filter(c => c.kind !== 'keyword').map(c => c.label);
	console.log(`[自动补全] 在 ${pos.line}:${pos.col} 位置的建议:`);
	console.log('  变量/计谋:', variables.join(', '));
	console.log('  关键字:', keywords.join(', '));
}
