// src/core/error.ts

import type * as AST from './ast.js';
import type { Token } from './tokenizer.js';

export const enum Phase {
	UNKNOWN = 0,
	INVARIANT,
	LEXICAL,
	SYNTACTIC,
	SEMANTIC,
	RUNTIME,
}

type StartPosition = { line: number; col: number };
type EndPosition = { endLine: number; endCol: number } | { endLine?: never; endCol?: never };
type ErrorParams = { message: string; phase: Phase } & StartPosition & EndPosition;

export class MeaoiuError {
	public readonly message: string;
	public readonly phase: Phase;
	public readonly line: number;
	public readonly col: number;
	public readonly endLine: number;
	public readonly endCol: number;

	constructor(params: ErrorParams) {
		const { message, phase, line, col, endLine = line, endCol = col } = params;
		this.message = message;
		this.phase = phase;
		this.line = line;
		this.col = col;
		this.endLine = endLine;
		this.endCol = endCol;
	}

	/** 错误消息，包含错误种类 */
	public get messageWithPhase(): string {
		const phaseString = {
			[Phase.UNKNOWN]: '？？？',
			[Phase.INVARIANT]: '世界崩坏',
			[Phase.LEXICAL]: '词法错误',
			[Phase.SYNTACTIC]: '句法错误',
			[Phase.SEMANTIC]: '语义错误',
			[Phase.RUNTIME]: '运行错误',
		}[this.phase];
		return `${phaseString}喵：${this.message}`;
	}

	public toString(): string {
		return `[${this.line}:${this.col}] ${this.message}`;
	}
}

export function errorFrom(ele: AST.Node | Token, message: string, phase: Phase): MeaoiuError {
	return new MeaoiuError({
		message,
		phase,
		...('endLine' in ele ? ele : { ...ele, endLine: ele.line, endCol: ele.col + (ele.value.length || 1) }),
	}); // 若来 ErrorNode，自然以 ErrorNode 的 message 覆盖；若是 Token，尾端位置为 Token 末尾
}

const parseIntOrNull = (input: string | undefined): number | null => {
	if (input == null) return null; // undefined 或 null -> 空
	const n = Number.parseInt(input, 10);
	return Number.isNaN(n) ? null : n;
};

export function parseError(message: string, phase: Phase = Phase.UNKNOWN): MeaoiuError {
	const errorParams = {
		message,
		phase,
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
