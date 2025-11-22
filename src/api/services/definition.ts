// src/api/services/definition.ts

import type { ServiceState } from '../serviceState.js';
import { findIdentifierAt } from '../utils/astUtils.js';
import type { SymbolInfo } from '../utils/symbolTable.js';

export function findDefinition(serviceState: ServiceState, position: { line: number; col: number }): SymbolInfo | undefined {
	const { program: ast } = serviceState.parseResult;

	const identifierNode = findIdentifierAt(ast, position.line, position.col);
	if (!identifierNode) return undefined;

	return serviceState.analyzeResult.symbolMap.get(identifierNode);
}
