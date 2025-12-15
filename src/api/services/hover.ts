// src/api/services/hover.ts

import { typeNames } from '../../core/typedef.js';
import type { ServiceState } from '../serviceState.js';
import { findIdentifierAt } from '../utils/astUtils.js';
import { SymbolKind, SymbolTag } from '../utils/symbolTable.js';

type HoverInfo = {
	text: string;
	line: number;
	col: number;
	endLine: number;
	endCol: number;
};

const kindMap = {
	[SymbolKind.FUNCTION]: 'function',
	[SymbolKind.VARIABLE]: 'variable',
	[SymbolKind.PARAMETER]: 'parameter',
} as const satisfies Record<SymbolKind, string>;

export function getHoverInfo(serviceState: ServiceState, position: { line: number; col: number }): HoverInfo | undefined {
	const { program: ast } = serviceState.parseResult;

	const identifierNode = findIdentifierAt(ast, position.line, position.col);
	if (!identifierNode) return undefined;

	const symbolInfo = serviceState.analyzeResult.symbolMap.get(identifierNode);
	if (!symbolInfo) return undefined;

	const { name, kind, type, tag, declarations } = symbolInfo;
	const declaration = declarations[0];

	const text = `**(${kindMap[kind] ?? 'unknown'}) ${name} : ${typeNames[type]}**${
		tag === SymbolTag.MOVED ? '\n\n(被标记为已移动)' : tag === SymbolTag.DECAYED ? '\n\n(源已被移走，不可用)' : ''
	}\n\n${declaration ? `在 L${declaration.line}:${declaration.col} 处声明` : `(这是一个内置计谋)`}`;

	const { line, col, endLine, endCol } = identifierNode;
	return { text, line, col, endLine, endCol };
}
