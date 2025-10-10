#!/usr/bin/env node
// src/main.ts - The Meaoiu CLI

import * as fs from 'fs';
import * as readlineSync from 'readline-sync';
import { tokenize } from './core/tokenizer.js';
import { Parser } from './core/parser.js';
import { Environment } from './core/environment.js';
import { evaluate } from './core/interpreter.js';
import type { MeaoiuRuntimeIO } from './core/io.js';
import { createBuiltInFunctions, type BuiltInFunctions } from './core/builtIns.js';
import { formatError } from './core/errorFormatter.js';
import { diagnose } from './lsp-services/diagnostics.js';
import { findDefinition } from './lsp-services/definition.js';
import { findReferences } from './lsp-services/references.js';
import { getHoverInfo } from './lsp-services/hover.js';
import { getCompletions } from './lsp-services/completions.js';

function run(sourceCode: string, builtIns: BuiltInFunctions, filePath: string) {
	console.log('=============================');
	console.log('执行 Meaoiu 代码...');
	console.log('=============================');
	try {
		const tokens = tokenize(sourceCode, { ignoreComments: true });
		const parser = new Parser(tokens);
		const { program: ast } = parser.parse();
		const globalEnv = new Environment();
		evaluate(ast, globalEnv, builtIns);
	} catch (e: any) {
		console.error(formatError(e, sourceCode, filePath));
	}
	console.log('=============================\n');
}

// --- CLI 主计谋 ---
function main() {
	const args = process.argv.slice(2);
	if (args.length === 0) {
		console.log('用法: meaoiu <文件名.miu> [--diagnose | --definition L:C]');
		return;
	}

	const filePath = args[0]!;
	const command = args[1]; // e.g., --diagnose or --definition
	const positionArg = args[2]; // e.g., 2:3

	try {
		const sourceCode = fs.readFileSync(filePath, 'utf-8');

		if (command === '--diagnose') {
			diagnose(sourceCode, filePath);
		} else if (command === '--definition' && positionArg) {
			const [line, col] = positionArg.split(':').map(Number);
			if (!line || !col) {
				console.error("位置参数格式错误，应为 '行:列'，例如 '2:3'");
				return;
			}

			const definitionInfo = findDefinition(sourceCode, { line, col });
			if (definitionInfo && definitionInfo.declarations[0]) {
				const defNode = definitionInfo.declarations[0];
				console.log(`[定义查找] '${definitionInfo.name}' 在 ${filePath}:${defNode.line}:${defNode.col} 被定义。`);
			} else {
				console.log(`[定义查找] 找不到 '${positionArg}' 位置符号的定义。`);
			}
		} else if (command === '--references' && positionArg) {
			const [line, col] = positionArg.split(':').map(Number);
			if (!line || !col) {
				console.error("位置参数格式错误，应为 '行:列'，例如 '2:3'");
				return;
			}

			const references = findReferences(sourceCode, { line, col });

			if (references.length > 0) {
				console.log(`[引用查找] 在 ${filePath} 中找到了 ${references.length} 处引用:`);
				for (const ref of references) {
					console.log(`- L${ref.line}:${ref.col}`);
				}
			} else {
				console.log(`[引用查找] 找不到 '${positionArg}' 位置符号的引用。`);
			}
		} else if (command === '--hover' && positionArg) {
			const [line, col] = positionArg.split(':').map(Number);
			if (!line || !col) {
				console.error("位置参数格式错误，应为 '行:列'，例如 '2:3'");
				return;
			}

			const hoverInfo = getHoverInfo(sourceCode, { line, col });

			if (hoverInfo) {
				console.log('--- 悬停信息 ---');
				console.log(hoverInfo);
				console.log('-----------------');
			} else {
				console.log(`[悬停] 在 ${line}:${col} 位置找不到可显示的信息。`);
			}
		} else if (command === '--complete' && positionArg) {
			const [line, col] = positionArg.split(':').map(Number);
			if (!line || !col) {
				console.error("位置参数格式错误，应为 '行:列'，例如 '2:3'");
				return;
			}

			const completions = getCompletions(sourceCode, { line, col });

			console.log(`[自动补全] 在 ${line}:${col} 位置的建议:`);

			const keywords = completions.filter((c) => c.kind === 'keyword').map((c) => c.label);
			const variables = completions.filter((c) => c.kind !== 'keyword').map((c) => c.label);

			console.log('  变量/计谋:', variables.join(', '));
			console.log('  关键字:', keywords.join(', '));
		} else {
			const cliIO: MeaoiuRuntimeIO = {
				print: (args: any[]) => {
					console.log(...args);
				},
				prompt: (question: string) => {
					return readlineSync.question(question);
				},
			};
			const builtIns = createBuiltInFunctions(cliIO);
			run(sourceCode, builtIns, filePath);
		}
	} catch (error) {
		console.error(`坏了喵！读取文件失败: ${filePath}`);
	}
}

// 启动！
main();
