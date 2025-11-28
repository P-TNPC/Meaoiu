// src/cli/tools/lens.ts

import { findDefinition } from '../../api/services/definition.js';
import { getHoverInfo } from '../../api/services/hover.js';
import { findReferences } from '../../api/services/references.js';
import { ServiceState } from '../../api/serviceState.js';
import { parsePosition } from './toolUtils.js';

export function definition(sourceCode: string, filePath: string, posRaw?: string) {
	const pos = parsePosition(posRaw);

	const definitionInfo = findDefinition(new ServiceState(0, sourceCode), pos);
	if (definitionInfo?.declarations?.[0]) {
		const defNode = definitionInfo.declarations[0];
		console.log(`[定义查找] '${definitionInfo.name}' 在 ${filePath}:${defNode.line}:${defNode.col} 被定义。`);
		return;
	}
	console.log(`[定义查找] 找不到 '${posRaw}' 位置符号的定义。`);
}

export function references(sourceCode: string, filePath: string, posRaw?: string) {
	const pos = parsePosition(posRaw);

	const references = findReferences(new ServiceState(0, sourceCode), pos);
	if (references?.length) {
		console.log(`[引用查找] 在 ${filePath} 中找到了 ${references.length} 处引用:`);
		for (const r of references) console.log(`- L${r.line}:${r.col}`);
		return;
	}
	console.log(`[引用查找] 找不到 '${posRaw}' 位置符号的引用。`);
}

export function hover(sourceCode: string, posRaw?: string) {
	const pos = parsePosition(posRaw);

	const hoverInfo = getHoverInfo(new ServiceState(0, sourceCode), pos);
	if (hoverInfo) {
		console.log('---- 悬停信息 ----');
		console.log(hoverInfo.text);
		console.log('-----------------');
		return;
	}
	console.log(`[悬停] 在 ${pos.line}:${pos.col} 位置找不到可显示的信息。`);
}
