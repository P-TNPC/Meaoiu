#!/usr/bin/env node
// src/cli/main.ts - Meaoiu CLI
const version = '__MEAOIU_VERSION__';

import { cac } from 'cac';
import { readFile } from 'node:fs/promises';
import { MeaoiuError, type IOConfig } from '../index.js';
import { complete } from './tools/completer.js';
import { diagnose } from './tools/diagnoser.js';
import { format } from './tools/formatter.js';
import { definition, hover, references } from './tools/searcher.js';
import { run } from './tools/starter.js';
import { prompt } from './tools/toolUtils.js';

const enum Option {
	DIAGNOSE = 'diagnose',
	FORMAT = 'format',
	DEFINITION = 'definition',
	REFERENCES = 'references',
	HOVER = 'hover',
	COMPLETE = 'complete',
	DEBUG = 'debug',
}

const cli = cac('meaoiu').version(version);
cli.help(sections => {
	sections.splice(1, 0, {
		title: 'Description',
		body: '  喵谕Meaoiu 语言工具集 — 运行、诊断、格式化、查定义/引用、补全',
	});
	const infoIndex = sections.findIndex(section => section.title?.includes('For more info'));
	if (infoIndex !== -1) sections.splice(infoIndex, 1);
})
	.usage('<file> [options]')
	.command('<file>', 'Meaoiu 源文件 (.miu)')
	.option(`--${Option.DIAGNOSE}`, '执行诊断（静态分析/错误提示）')
	.option(`--${Option.FORMAT}`, '格式化代码')
	.option(`--${Option.DEFINITION} <line:col>`, "查找定义，格式 '行:列'，例如 '2:3'")
	.option(`--${Option.REFERENCES} <line:col>`, "查找引用，格式 '行:列'")
	.option(`--${Option.HOVER} <line:col>`, "悬停信息，格式 '行:列'")
	.option(`--${Option.COMPLETE} <line:col>`, "获取自动补全，格式 '行:列'")
	.option(`--${Option.DEBUG}`, '运行 Meaoiu 脚本并输出调试日志')
	.action(async (file: string, options: Record<string, string>) => {
		try {
			const sourceCode = await readFile(file, 'utf-8');

			// 优先命令式选项（诊断 / LSP 式功能）
			const lspActions: Record<Option, (arg: string) => void | boolean> = {
				[Option.DIAGNOSE]: () => diagnose(sourceCode, file),
				[Option.FORMAT]: () => void format(sourceCode, file),
				[Option.DEFINITION]: pos => definition(sourceCode, file, pos),
				[Option.REFERENCES]: pos => references(sourceCode, file, pos),
				[Option.HOVER]: pos => hover(sourceCode, pos),
				[Option.COMPLETE]: pos => complete(sourceCode, pos),
				[Option.DEBUG]: () => (debug = true) /* true 则继续执行 */,
			};
			let debug = false;

			// 找出第一个被设置的选项（优先级顺序按 keys 顺序）
			for (const [key, action] of Object.entries(lspActions)) {
				const value = options[key];
				if (value && !action(value)) return;
			}

			// 默认行为：运行脚本（交互 I/O）
			const ioConfig: IOConfig = {
				onPrint: console.log,
				onPrompt: prompt,
				styleize: true,
			};
			await run(sourceCode, ioConfig, file, debug);
		} catch (err) {
			if (err instanceof MeaoiuError) console.error(err.message);
			else if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
				console.error(`坏了喵！文件 ${file} 不见了喵！`);
			} else console.error(`坏了喵！读取文件 ${file} 失败: `, err);
			process.exit(1);
		}
	});

try {
	cli.parse();
} catch (err: unknown) {
	if (err instanceof Error && err.name === 'CACError') {
		if (err.message.includes('missing required args')) {
			console.error('不好喵！忘记说文件在哪了喵！\n');
			cli.outputHelp();
			process.exit(1);
		} else if (err.message.includes('value is missing')) console.error('不好喵！不能没有坐标喵！');
		else if (err.message.includes('Unknown option')) console.error('不好喵！有不认识的选项喵！');
		else console.error(`坏了喵！${err.message}`);
		console.error('\n可以用 meaoiu --help 偷看攻略喵。');
		process.exit(1);
	}

	throw err;
}
