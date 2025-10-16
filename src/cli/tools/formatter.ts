// src/cli/tools/formatter.ts

import { writeFile } from 'fs/promises';
import { getFormattedCode } from '../../services/formatting.js';
import { prompt } from './toolUtils.js';

export async function format(sourceCode: string, filePath: string) {
	const formattedCode = getFormattedCode(sourceCode);
	console.log(`[格式化器] 格式化 ${filePath} 结果预览:`);
	console.log('-----------------------------');
	console.log(formattedCode);
	console.log('-----------------------------');
	// 询问是否格式化
	const confirm = await prompt(`[格式化器] ⚠ 是否应用到 ${filePath}? (y/n)`);
	if (confirm.toLowerCase() === 'y') {
		// 格式化并写入文件
		await writeFile(filePath, formattedCode, 'utf-8');
		console.log(`[格式化器] ✔ 已写入文件`);
	} else {
		console.log(`[格式化器] ✖ 操作已取消`);
	}
}
