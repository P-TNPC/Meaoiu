// src/cli/tools/toolUtils.ts

import * as path from 'path';
import readline from 'readline';
import stringWidth from 'string-width';

export function parsePosition(pos?: string): { line: number; col: number } {
	if (!pos) throw new Error('位置参数不能为空');
	const parts = pos.split(':');
	if (parts.length !== 2) throw new Error('位置参数格式错误，应为 "行:列"，如 "2:3"');
	const line = Number(parts[0]);
	const col = Number(parts[1]);
	if (!Number.isInteger(line) || !Number.isInteger(col) || line <= 0 || col <= 0) {
		throw new Error('位置参数格式错误，行和列必须为正整数');
	}
	return { line, col };
}

export function formatError(error: unknown, sourceCode: string, filePath: string): string {
	const message = error instanceof Error ? error.message : String(error);

	const match = message.match(/\[(\d+):(\d+)\]/);
	if (!match) return `坏了喵: ${message}`;

	const [, lineStr, colStr] = match;
	const line = parseInt(lineStr!, 10);
	const col = parseInt(colStr!, 10);

	const lines = sourceCode.split('\n');
	const errorLine = lines[line - 1];
	if (errorLine === undefined) return `坏了喵: ${message} (找不到秘卷第 ${line} 行)`;

	const prefix = errorLine.substring(0, col - 1);
	const prefixWidth = stringWidth(prefix);
	const indicator = `${' '.repeat(prefixWidth)}^`;

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
}
