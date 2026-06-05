// src/cli/tools/toolUtils.ts

import path from 'node:path';
import readline from 'node:readline';
import stringWidth from 'string-width';
import { MeaoiuError, parseError } from '../../index.js';

export function parsePosition(pos: string): { line: number; col: number; character: number } {
	const parts = pos.split(':');
	if (parts.length !== 2) throw parseError("位置参数格式错误，应为 '行:列'，如 '2:3'");
	const line = Number(parts[0]);
	const col = Number(parts[1]);
	if (!Number.isInteger(line) || !Number.isInteger(col) || line <= 0 || col <= 0) {
		throw parseError('位置参数格式错误，行和列必须为正整数');
	}
	return { line, col, character: col };
}

export function formatError(error: unknown, sourceCode: string, filePath: string): string {
	const {
		messageWithPhase: message,
		line,
		col,
		endLine,
		endCol,
	} = error instanceof MeaoiuError ? error : parseError(error instanceof Error ? error.message : String(error));

	if (line <= 0) return `\n💥 坏了喵！💥\n${message}\n`;

	const lines = sourceCode.split('\n');
	const errorLine = lines[line - 1];
	if (errorLine === undefined) return `坏了喵: ${message} (找不到秘卷第 ${line} 行)`;

	const prefix = errorLine.slice(0, col - 1);
	const prefixWidth = stringWidth(prefix);
	const errorPart = errorLine.slice(col - 1, (endLine === line ? endCol : errorLine.length) - 1);
	const errorPartWidth = stringWidth(errorPart) || 1;
	const indicator = `${' '.repeat(prefixWidth)}${'^'.repeat(errorPartWidth)}`;

	const fileName = path.basename(filePath);
	const formattedMessage = [
		`\n💥 坏了喵！💥`,
		`${message}`,
		``,
		`--> ${fileName}:${line}:${col}`,
		`   |`,
		`${String(line).padStart(3, ' ')}| ${errorLine}`,
		`   | ${indicator}`,
		``,
	].join('\n');

	return formattedMessage;
}

export async function prompt(question: string): Promise<string> {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	return new Promise(resolve => {
		rl.question(question, answer => {
			rl.close();
			resolve(answer);
		});
	});
}
