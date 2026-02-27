// src/api/services/inlayHints.ts

import type * as AST from '../../core/ast.js';
import { NodeKind } from '../../core/ast.js';
import { MeaoiuType, typeNames } from '../../core/typedef.js';
import type { ServiceState } from '../serviceState.js';
import { buildParentMap, isNodeArray } from '../utils/astUtils.js';
import { SymbolKind, SymbolTag, type SymbolInfo } from '../utils/symbolTable.js';

/**
 * 内联提示的位置
 */
interface Position {
	line: number;
	character: number;
}

const enum InlayHintKind {
	Type = 1,
	Parameter = 2,
}

/**
 * 内联提示信息结构
 */
export interface InlayHint {
	position: Position;
	label: string;
	kind: InlayHintKind;
	paddingLeft?: boolean;
	paddingRight?: boolean;
}

/**
 * 辅助函数：追踪引用链找到最终的符号
 */
function findUltimateSource(symbol: SymbolInfo): SymbolInfo {
	while (symbol.valueRef) symbol = symbol.valueRef;
	return symbol;
}

/**
 * 辅助函数：从函数定义的参数块中提取参数名
 */
function extractParamNames(paramsBlock: AST.BlockExpression): string[] {
	const names: string[] = [];
	for (const paramStmt of paramsBlock.body) {
		if (paramStmt.kind === NodeKind.VariableDeclaration) {
			names.push(paramStmt.identifier.symbol);
		} else if (paramStmt.kind === NodeKind.ExpressionStatement) {
			const expr = paramStmt.expression;
			if (expr.kind === NodeKind.Identifier) {
				names.push(expr.symbol);
			} else if (expr.kind === NodeKind.UnaryExpression && expr.argument.kind === NodeKind.Identifier) {
				names.push(expr.argument.symbol);
			}
			// 其他类型的表达式作为参数时没有名字
		}
	}
	return names;
}

/**
 * 主函数：获取源代码的内联提示
 */
export function getInlayHints(serviceState: ServiceState): InlayHint[] {
	const hints: InlayHint[] = [];

	const { program: ast } = serviceState.parseResult;
	const parentMap = buildParentMap(ast); // 构建父节点映射

	const { symbolMap } = serviceState.analyzeResult;
	const moveMarks = ['_' /*MOVED*/, '' /*NORMAL*/, '!' /*DECAYED*/];

	// 生成变量类型和引用源提示
	symbolMap.forEach((symbolInfo, node) => {
		if (node.kind !== NodeKind.Identifier || symbolInfo.kind === SymbolKind.FUNCTION) return;

		const { name, type } = symbolInfo;
		const isUnknown = type === MeaoiuType.UNKNOWN;
		const isReference = !!symbolInfo.valueRef;
		if (isUnknown && !isReference) return;

		const { name: ultimateName, tag: ultimateTag } = findUltimateSource(symbolInfo);
		const isUltimateNormal = ultimateTag === SymbolTag.NORMAL;
		const isUltimateDecayed = ultimateTag === SymbolTag.DECAYED;

		const moveMark = moveMarks[+isUltimateNormal || +isUltimateDecayed << 1]!;
		const sourceName = ultimateName === name ? '' : `${!isUltimateNormal ? '' : '*'}${ultimateName}`;
		const symbolType = isReference || isUnknown || isUltimateDecayed ? '' : `:${typeNames[type]}`;

		hints.push({
			position: { line: node.line, character: node.endCol },
			label: `${moveMark}${sourceName}${symbolType}`,
			kind: InlayHintKind.Type,
		});
	});

	// 生成函数参数名提示
	function walk(node: AST.Node) {
		if (node.kind === NodeKind.CallExpression && node.args.kind === NodeKind.BlockExpression && node.args.isCollection) {
			const calleeInfo = symbolMap.get(node.callee);

			if (calleeInfo?.kind === SymbolKind.FUNCTION && !calleeInfo.isBuiltIn && calleeInfo.declarations[0]) {
				// 从父节点映射找到 FunctionDeclaration
				const funcDecNode = parentMap.get(calleeInfo.declarations[0]);

				if (funcDecNode?.kind === NodeKind.FunctionDeclaration) {
					const paramNames = extractParamNames(funcDecNode.parameters);
					for (const [index, { line, col }] of node.args.body.entries()) {
						if (index >= paramNames.length) break;
						const paramName = paramNames[index];
						hints.push({
							position: { line, character: col },
							label: `${paramName}:`,
							kind: InlayHintKind.Parameter,
							paddingRight: true,
						});
					}
				}
			}
		}

		// 递归遍历子节点
		for (const key in node) {
			const value = node[key];
			if (!value || typeof value !== 'object') continue;
			if (!Array.isArray(value)) walk(value);
			else if (isNodeArray(value)) value.forEach(child => walk(child));
		}
	}
	walk(ast);

	// 按位置排序，确保编辑器能正确显示
	return hints.sort((a, b) => {
		return a.position.line !== b.position.line
			? a.position.line - b.position.line
			: a.position.character - b.position.character;
	});
}
