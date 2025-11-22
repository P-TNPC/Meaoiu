#!/usr/bin/env node
// src/cli/main.ts - Meaoiu CLI

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { createBuiltInFunctions } from '../core/builtIns.js';
import { createRuntimeIO } from '../core/run/io.js';
import { complete } from './tools/completer.js';
import { diagnose } from './tools/diagnoser.js';
import { format } from './tools/formatter.js';
import { definition, hover, references } from './tools/lens.js';
import { run } from './tools/starter.js';
import { prompt } from './tools/toolUtils.js';

const program = new Command();

program
	.name('meaoiu')
	.usage('<file> [options]')
	.argument('<file>', 'Meaoiu 源文件 (.miu)')
	.option('--diagnose', '执行诊断（静态分析/错误提示）')
	.option('--format', '格式化代码')
	.option('--definition <line:col>', "查找定义，格式 '行:列'，例如 '2:3'")
	.option('--references <line:col>', "查找引用，格式 '行:列'")
	.option('--hover <line:col>', "悬停信息，格式 '行:列'")
	.option('--complete <line:col>', "获取自动补全，格式 '行:列'")
	.description('Meaoiu 语言工具集 — 运行、诊断、格式化、查定义/引用、补全')
	.action(async (file: string, options: Record<string, string>) => {
		try {
			const sourceCode = readFileSync(file, 'utf-8');

			// 优先命令式选项（诊断 / LSP 式功能）
			const lspActions: Record<string, (arg?: string) => void> = {
				diagnose: () => diagnose(sourceCode, file),
				format: () => format(sourceCode, file),
				definition: pos => definition(sourceCode, file, pos!),
				references: pos => references(sourceCode, file, pos!),
				hover: pos => hover(sourceCode, pos!),
				complete: pos => complete(sourceCode, pos!),
			};

			// 找出第一个被设置的选项（优先级顺序按 keys 顺序）
			for (const [key, action] of Object.entries(lspActions)) {
				const value = options[key];
				if (value) {
					action(value);
					return;
				}
			}

			// 默认行为：运行脚本（交互 I/O）
			const cliIO = createRuntimeIO({
				onPrint: (formattedString: string) => {
					console.log(formattedString);
				},
				onPrompt: prompt,
				useColor: true,
			});
			const builtIns = createBuiltInFunctions(cliIO);
			await run(sourceCode, builtIns, file);
		} catch (err) {
			console.error(`坏了喵！读取文件 ${file} 失败: `, err);
		}
	});

program.parse(process.argv);
