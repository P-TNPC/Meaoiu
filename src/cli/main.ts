#!/usr/bin/env node
// src/main.ts - Meaoiu CLI
import fs from 'fs';
import { Command } from 'commander';
import readline from 'readline';
import { tokenize } from '../core/tokenizer.js';
import { Parser } from '../core/parser.js';
import { Environment } from '../core/environment.js';
import { evaluate } from '../core/interpreter.js';
import { createRuntimeIO } from '../core/io.js';
import { createBuiltInFunctions, type BuiltInFunctions } from '../core/builtIns.js';
import { formatError } from '../core/errorFormatter.js';
import { diagnose } from '../cli/diagnose.js';
import { findDefinition } from '../services/definition.js';
import { findReferences } from '../services/references.js';
import { getHoverInfo } from '../services/hover.js';
import { getCompletions } from '../services/completions.js';

const program = new Command();

async function run(sourceCode: string, builtIns: BuiltInFunctions, filePath: string) {
	console.log('=============================');
	console.log('执行 Meaoiu 代码...');
	console.log('=============================');
	try {
		const tokens = tokenize(sourceCode, { ignoreComments: true });
		const parser = new Parser(tokens);
		const { program: ast } = parser.parse();
		const globalEnv = new Environment();
		await evaluate(ast, globalEnv, builtIns);
	} catch (e: any) {
		console.error(formatError(e, sourceCode, filePath));
	}
	console.log('=============================\n');
}

function parsePosition(pos?: string): { line: number; col: number } | null {
	if (!pos) return null;
	const parts = pos.split(':');
	if (parts.length !== 2) return null;
	const line = Number(parts[0]);
	const col = Number(parts[1]);
	if (!Number.isInteger(line) || !Number.isInteger(col) || line <= 0 || col <= 0) return null;
	return { line, col };
}

program
	.name('meaoiu')
	.usage('<file> [options]')
	.argument('<file>', 'Meaoiu 源文件 (.miu)')
	.option('--diagnose', '执行诊断（静态分析/错误提示）')
	.option('--definition <line:col>', "查找定义，格式 '行:列'，例如 '2:3'")
	.option('--references <line:col>', "查找引用，格式 '行:列'")
	.option('--hover <line:col>', "悬停信息，格式 '行:列'")
	.option('--complete <line:col>', "获取自动补全，格式 '行:列'")
	.description('Meaoiu 语言工具集 — 运行、诊断、查定义/引用、悬停、补全')
	.action(async (file: string, options: any) => {
		try {
			const sourceCode = fs.readFileSync(file, 'utf-8');

			// 优先命令式选项（诊断 / LSP 式功能）
			if (options.diagnose) {
				diagnose(sourceCode, file);
				return;
			}

			if (options.definition) {
				const pos = parsePosition(options.definition);
				if (!pos) {
					console.error("位置参数格式错误，应为 '行:列'，例如 '2:3'");
					return;
				}
				const definitionInfo = findDefinition(sourceCode, pos);
				if (definitionInfo && definitionInfo.declarations?.[0]) {
					const defNode = definitionInfo.declarations[0];
					console.log(`[定义查找] '${definitionInfo.name}' 在 ${file}:${defNode.line}:${defNode.col} 被定义。`);
				} else {
					console.log(`[定义查找] 找不到 '${options.definition}' 位置符号的定义。`);
				}
				return;
			}

			if (options.references) {
				const pos = parsePosition(options.references);
				if (!pos) {
					console.error("位置参数格式错误，应为 '行:列'，例如 '2:3'");
					return;
				}
				const references = findReferences(sourceCode, pos);
				if (references?.length) {
					console.log(`[引用查找] 在 ${file} 中找到了 ${references.length} 处引用:`);
					for (const r of references) {
						console.log(`- L${r.line}:${r.col}`);
					}
				} else {
					console.log(`[引用查找] 找不到 '${options.references}' 位置符号的引用。`);
				}
				return;
			}

			if (options.hover) {
				const pos = parsePosition(options.hover);
				if (!pos) {
					console.error("位置参数格式错误，应为 '行:列'，例如 '2:3'");
					return;
				}
				const hoverInfo = getHoverInfo(sourceCode, pos);
				if (hoverInfo) {
					console.log('--- 悬停信息 ---');
					console.log(hoverInfo);
					console.log('-----------------');
				} else {
					console.log(`[悬停] 在 ${pos.line}:${pos.col} 位置找不到可显示的信息。`);
				}
				return;
			}

			if (options.complete) {
				const pos = parsePosition(options.complete);
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
				return;
			}

			// 默认行为：运行脚本（交互 I/O）
			const cliIO = createRuntimeIO({
				onPrint: (formattedString: string) => {
					console.log(formattedString);
				},
				onPrompt: (question: string): Promise<string> => {
					const rl = readline.createInterface({
						input: process.stdin,
						output: process.stdout,
					});
					return new Promise(resolve => {
						rl.question(question, answer => {
							rl.close();
							resolve(answer);
						});
					});
				},
				useColor: true,
			});
			const builtIns = createBuiltInFunctions(cliIO);
			await run(sourceCode, builtIns, file);
		} catch (err) {
			console.error(`坏了喵！读取文件失败: ${file}`);
		}
	});

program.parse(process.argv);
