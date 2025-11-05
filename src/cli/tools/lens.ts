// src/cli/tools/lens.ts

import { findDefinition } from '../../services/definition.js';
import { getHoverInfo } from '../../services/hover.js';
import { findReferences } from '../../services/references.js';
import { parsePosition } from './toolUtils.js';

export function definition(sourceCode: string, posRaw: string, filePath: string) {
	const pos = parsePosition(posRaw);

	const definitionInfo = findDefinition(sourceCode, pos);
	if (definitionInfo?.declarations?.[0]) {
		const defNode = definitionInfo.declarations[0];
		console.log(`[定义查找] '${definitionInfo.name}' 在 ${filePath}:${defNode.line}:${defNode.col} 被定义。`);
		return;
	}
	console.log(`[定义查找] 找不到 '${posRaw}' 位置符号的定义。`);
}

export function references(sourceCode: string, posRaw: string, filePath: string) {
	const pos = parsePosition(posRaw);

	const references = findReferences(sourceCode, pos);
	if (references?.length) {
		console.log(`[引用查找] 在 ${filePath} 中找到了 ${references.length} 处引用:`);
		for (const r of references) console.log(`- L${r.line}:${r.col}`);
		return;
	}
	console.log(`[引用查找] 找不到 '${posRaw}' 位置符号的引用。`);
}

export function hover(sourceCode: string, posRaw: string) {
	const pos = parsePosition(posRaw);

	const hoverInfo = getHoverInfo(sourceCode, pos);
	if (hoverInfo) {
		console.log('---- 悬停信息 ----');
		console.log(hoverInfo.text);
		console.log('-----------------');
		return;
	}
	console.log(`[悬停] 在 ${pos.line}:${pos.col} 位置找不到可显示的信息。`);
}
