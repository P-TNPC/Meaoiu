// src/api/services/references.ts

import type * as AST from '../../core/ast.js';
import type { ServiceState } from '../serviceState.js';
import { findIdentifierAt } from '../utils/astUtils.js';

export function findReferences(serviceState: ServiceState, position: { line: number; col: number }): AST.Identifier[] {
	const { program: ast } = serviceState.parseResult;

	const identifierNode = findIdentifierAt(ast, position.line, position.col);
	if (!identifierNode) return [];

	const symbolInfo = serviceState.analyzeResult.symbolMap.get(identifierNode);
	if (!symbolInfo) return [];

	return [...symbolInfo.declarations, ...symbolInfo.references];
}
