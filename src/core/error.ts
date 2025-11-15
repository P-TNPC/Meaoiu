// src/core/error.ts

import type * as AST from './ast.js';
import type { Token } from './tokenizer.js';

type StartPosition = { line: number; col: number };
type EndPosition = { endLine: number; endCol: number };
type ErrorParams = { message: string } & StartPosition & (EndPosition | {});

export class MeaoiuError {
	public message: string;
	public line: number;
	public col: number;
	public endLine: number;
	public endCol: number;

	constructor(params: ErrorParams) {
		const { message, line, col } = params;
		this.message = message;
		this.line = line;
		this.col = col;
		this.endLine = 'endLine' in params ? params.endLine : line;
		this.endCol = 'endCol' in params ? params.endCol : col;
	}

	toString() {
		return `[${this.line}:${this.col}] ${this.message}`;
	}
}

export function errorFrom(ele: AST.Node | Token, message: string): MeaoiuError {
	return new MeaoiuError({
		message,
		...('endLine' in ele ? ele : { ...ele, endLine: ele.line, endCol: ele.col + ele.value.length }),
	}); // 若来 ErrorNode，自然以 ErrorNode 的 message 覆盖；若是 Token，尾端位置为 Token 末尾
}

const parseIntOrNull = (input: string | undefined): number | null => {
	if (input == null) return null; // undefined 或 null -> 空
	const n = Number.parseInt(input, 10);
	return Number.isNaN(n) ? null : n;
};

export function parseError(message: string): MeaoiuError {
	const errorParams = {
		message,
		line: -1,
		col: -1,
	};
	const match = message.match(/\[(\d+):(\d+)\]/);
	if (match) {
		const [rawPos, rawLine, rawCol] = match;
		errorParams.message = message.replace(rawPos, '').trim(); // 移除匹配到的位置信息部分
		errorParams.line = parseIntOrNull(rawLine) ?? errorParams.line;
		errorParams.col = parseIntOrNull(rawCol) ?? errorParams.col;
	}
	return new MeaoiuError(errorParams);
}
