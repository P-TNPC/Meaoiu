// src/api/services/search.ts

import type * as AST from '../../core/ast.js';
import { typeNames } from '../../core/typedef.js';
import type { ServiceState } from '../serviceState.js';
import { findIdentifierAt } from '../utils/astUtils.js';
import { rangeOf, type MeaoiuLocation, type Position, type Range } from '../utils/lspUtils.js';
import { SymbolKind, SymbolTag, type SymbolInfo } from '../utils/symbolTable.js';

// 悬停
type MarkupKind = 'plaintext' | 'markdown';
type HoverInfo = {
	contents: {
		kind: MarkupKind;
		value: string;
	};
	range: Range;
};

function hoverInfoFrom(location: MeaoiuLocation, value: string, kind: MarkupKind): HoverInfo {
	return { contents: { kind, value }, range: rangeOf(location) };
}

const kindMap = {
	[SymbolKind.FUNCTION]: 'function',
	[SymbolKind.VARIABLE]: 'variable',
	[SymbolKind.PARAMETER]: 'parameter',
} as const satisfies Record<SymbolKind, string>;

export function getHoverInfo(
	serviceState: ServiceState,
	{ line, character: col }: Position,
	contentsKind: MarkupKind = 'markdown',
): HoverInfo | undefined {
	const identifierNode = findIdentifierAt(serviceState.parseResult.program, line, col);
	if (!identifierNode) return undefined;
	const symbolInfo = serviceState.analyzeResult.symbolMap.get(identifierNode);
	if (!symbolInfo) return undefined;

	const { name, kind, type, tag, declarations } = symbolInfo;
	const declaration = declarations[0];

	const text = `**(${kindMap[kind] ?? 'unknown'}) ${name} : ${typeNames[type]}**${
		tag === SymbolTag.MOVED ? '\n\n(被标记为已移动)' : tag === SymbolTag.DECAYED ? '\n\n(源已被移走，不可用)' : ''
	}\n\n${declaration ? `在 L${declaration.line}:${declaration.col} 处声明` : `(这是一个内置计谋)`}`;

	return hoverInfoFrom(identifierNode, text, contentsKind);
}

// 查找定义
export function findDefinition(serviceState: ServiceState, { line, character: col }: Position): SymbolInfo | undefined {
	const identifierNode = findIdentifierAt(serviceState.parseResult.program, line, col);
	return identifierNode ? serviceState.analyzeResult.symbolMap.get(identifierNode) : undefined;
}

// 查找引用
export function findReferences(serviceState: ServiceState, position: Position): AST.Identifier[] {
	const symbolInfo = findDefinition(serviceState, position);
	return symbolInfo ? [...symbolInfo.declarations, ...symbolInfo.references] : [];
}
