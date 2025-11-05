// src/services/hover.ts

import { tokenize } from '../core/tokenizer.js';
import { Parser } from '../core/parser.js';
import { analyzeSymbols } from './utils/symbolAnalyzer.js';
import { builtInFunctionNames } from '../core/builtIns.js';
import { findIdentifierAt } from './utils/astUtils.js';

type HoverInfo = {
	text: string;
	line: number;
	col: number;
	endLine: number;
	endCol: number;
};

export function getHoverInfo(sourceCode: string, position: { line: number; col: number }): HoverInfo | undefined {
	const parser = new Parser(tokenize(sourceCode, { ignoreComments: true }), 'tolerant');
	const { program: ast } = parser.parse();
	if (!ast) return undefined;

	const identifierNode = findIdentifierAt(ast, position.line, position.col);
	if (!identifierNode) return undefined;

	const { symbolMap } = analyzeSymbols(ast, builtInFunctionNames);
	const symbolInfo = symbolMap.get(identifierNode);
	if (!symbolInfo) return undefined;

	const declaration = symbolInfo.declarations[0];
	let hoverText = `**(${symbolInfo.kind}) ${symbolInfo.name} : ${symbolInfo.type}**`;
	if(symbolInfo.isMoved) hoverText += `\n\n(源被标记为已移动)`;
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
