// src/cli/tools/starter.ts

import { execute, LogLevel, type IOConfig } from '../../index.js';
import { formatError } from './toolUtils.js';

export async function run(sourceCode: string, ioConfig: IOConfig, filePath: string, debug: boolean): Promise<void> {
	if (/^\s*$/.test(sourceCode)) return console.error('没有字喵！');
	let start = 0,
		end = 0;
	console.log('=============================');
	console.log('执行 Meaoiu 代码...');
	console.log('=============================');
	try {
		start = performance.now();
		await execute(sourceCode, ioConfig, { logLevel: debug ? LogLevel.DEBUG : LogLevel.WARN });
		end = performance.now();
	} catch (err) {
		console.error('\n-----------------------------');
		console.error(formatError(err, sourceCode, filePath));
	}
	console.log('=============================');
	if (end > start) (console.log(`耗时: ${end - start} 毫秒`), console.log('============================='));
}
