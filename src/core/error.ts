// src/core/error.ts
// 未启用
import type * as AST from './ast.js';
import type { Token } from './tokenizer.js';

export type MeaoiuError = {
	message: string;
	line: number;
	col: number;
	endLine: number;
	endCol: number;
};

export function createError(message: string, ele: AST.Node | Token): MeaoiuError {
	const error: MeaoiuError = {
		message,
		line: ele.line,
		col: ele.col,
		endLine: ele.line,
		endCol: ele.col,
	};
	if ('endLine' in ele) {
		error.endLine = ele.endLine;
		error.endCol = ele.endCol;
	}
	return error;
}

export function throwError(message: string, ele: AST.Node | Token): never {
	throw createError(message, ele);
}

export function toMeaoiuError(err: Error): MeaoiuError {
	const error: MeaoiuError = {
		message: err.message,
		line: 0,
		col: 0,
		endLine: 0,
		endCol: 0,
	};
	const match = err.message.match(/\[(\d+):(\d+)\]/);
	if (match) {
		const [rawPos, rawLine, rawCol] = match;
		error.message = err.message.replace(rawPos, '').trim(); // 移除匹配到的位置信息部分
		error.line = rawLine ? parseInt(rawLine, 10) : error.line;
		error.col = rawCol ? parseInt(rawCol, 10) : error.col;
		error.endLine = error.line;
		error.endCol = error.col;
	}
	return error;
}

export function formatError(error: MeaoiuError): string {
	return `[${error.line}:${error.col}] ${error.message}`;
}
