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

	const declaration = symbolInfo.declarations[0];
	let hoverText = `**(${kindMap[symbolInfo.kind] ?? 'unknown'}) ${symbolInfo.name} : ${typeNames[symbolInfo.type]}**`;
	if (symbolInfo.tag === SymbolTag.MOVED) hoverText += `\n\n(被标记为已移动)`;
	else if (symbolInfo.tag === SymbolTag.DECAYED) hoverText += `\n\n(源已被移走，不可用)`;
	if (declaration) hoverText += `\n\n在 L${declaration.line}:${declaration.col} 处声明`;
	else hoverText += `\n\n(这是一个内置计谋)`;

	return {
		text: hoverText,
		line: identifierNode.line,
		col: identifierNode.col,
		endLine: identifierNode.endLine,
		endCol: identifierNode.endCol,
	};
}
