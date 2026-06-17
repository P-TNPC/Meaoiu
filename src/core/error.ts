// src/core/error.ts

import type * as AST from './ast.js';
import type { Token } from './lexer/tokenizer.js';

export const enum Phase {
	UNKNOWN = 0,
	INVARIANT,
	LEXICAL,
	SYNTACTIC,
	SEMANTIC,
	RUNTIME,
}

type ErrorParams = { message: string; phase: Phase; line: number; col: number; endLine: number; endCol: number };

export class MeaoiuError {
	public readonly message: string;
	public readonly phase: Phase;
	public readonly line: number;
	public readonly col: number;
	public readonly endLine: number;
	public readonly endCol: number;

	constructor({ message, phase, line, col, endLine, endCol }: ErrorParams) {
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
		...ele,
		endCol: ele.endCol + +(ele.line === ele.endLine && ele.col === ele.endCol),
	}); // 若来 ErrorNode，自然以 ErrorNode 的 message 覆盖
}

export function parseError(message: string, phase: Phase = Phase.UNKNOWN): MeaoiuError {
	const errorParams = { message, phase, line: -1, col: -1, endLine: -1, endCol: -1 };
	const match = /^\s*\[(\d+):(\d+)\]\s*/.exec(message);
	if (match) {
		const [rawPos, rawLine, rawCol] = match;
		errorParams.message = message.slice(rawPos.length); // 移除匹配到的位置信息部分
		errorParams.endLine = errorParams.line = Number.parseInt(rawLine!, 10);
		errorParams.endCol = (errorParams.col = Number.parseInt(rawCol!, 10)) + 1;
	}
	return new MeaoiuError(errorParams);
}
