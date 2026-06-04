// src/cli/tools/searcher.ts

import { findDefinition, findReferences, getHoverInfo, ServiceState } from '../../index.js';
import { parsePosition } from './toolUtils.js';

export function definition(sourceCode: string, filePath: string, posRaw: string): void {
	const pos = parsePosition(posRaw);

	const definitionInfo = findDefinition(new ServiceState(0, sourceCode), pos);

	const defNode = definitionInfo?.declarations[0];
	if (!defNode) return console.log(`[定义查找] 找不到 '${posRaw}' 位置符号的定义。`);
	console.log(`[定义查找] '${definitionInfo.name}' 在 ${filePath}:${defNode.line}:${defNode.col} 被定义。`);
}

export function references(sourceCode: string, filePath: string, posRaw: string): void {
	const pos = parsePosition(posRaw);

	const references = findReferences(new ServiceState(0, sourceCode), pos);
	if (!references.length) return console.log(`[引用查找] 找不到 '${posRaw}' 位置符号的引用。`);
	console.log(`[引用查找] 在 ${filePath} 中找到了 ${references.length} 处引用:`);
	for (const { line, col } of references) console.log(`- L${line}:${col}`);
}

export function hover(sourceCode: string, posRaw: string): void {
	const pos = parsePosition(posRaw);

	const hoverInfo = getHoverInfo(new ServiceState(0, sourceCode), pos);
	if (!hoverInfo) return console.log(`[悬停] 在 '${posRaw}' 位置找不到可显示的信息。`);
	console.log('---- 悬停信息 ----');
	console.log(hoverInfo.contents.value);
	console.log('-----------------');
}
