// src/api/utils/lspUtils.ts

export type Position = {
	line: number;
	character: number;
};

export type Range = {
	start: Position;
	end: Position;
};

export type MeaoiuLocation = { line: number; col: number; endLine: number; endCol: number };

export function rangeOf({ line, col, endLine, endCol }: MeaoiuLocation): Range {
	return { start: { line, character: col }, end: { line: endLine, character: endCol } };
}
