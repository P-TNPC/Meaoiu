// src/core/typedef.ts

import { Environment } from './run/environment.js';

export const typeMap = {
	number: '摸数',
	string: '闲话',
	boolean: '好坏',
	null: '空碗',
	function: '计谋',
	collection: '纸箱',
	unknown: '不懂',
} as const;
type TypeMap = typeof typeMap;
type TypeMapKey = keyof TypeMap;
export type MeaoiuType = TypeMap[TypeMapKey];

export type TypeBase = {
	number: number;
	string: string;
	boolean: boolean;
	null: null;
	function: Function;
	collection: Environment;
	unknown: unknown;
}[Exclude<TypeMapKey, 'unknown' | 'function'>];

export function getMeaoiuType(v: unknown): MeaoiuType {
	if (v === null || v === undefined) return typeMap.null;
	if (v instanceof Environment) return typeMap.collection;
	const t = typeof v;
	if (t in typeMap) return typeMap[t as TypeMapKey];
	return typeMap.unknown;
}

/**
 * 检查算术运算的类型是否合法
 * @returns 错误信息，如果合法则返回 undefined
 */
export function checkArithmeticOperation(
	op: string,
	leftType: MeaoiuType,
	rightType: MeaoiuType
): string | undefined {
	if (leftType !== rightType) {
		return `'${op}' 操作符只能给同类用喵! ${leftType} 和 ${rightType} 不可以喵!`;
	}

	if (['-', '*', '/'].includes(op) && leftType !== typeMap.number) {
		return `'${op}' 操作符只能用于两个 ${typeMap.number} 之间喵!`;
	}

	if (
		op === '+' &&
		leftType !== typeMap.number &&
		leftType !== typeMap.string &&
		leftType !== typeMap.collection
	) {
		return `'${op}' 操作符只能用在 ${typeMap.number}、${typeMap.string} 或 ${typeMap.collection} 上喵!`;
	}

	return undefined; // 合法
}

/**
 * 检查比较运算的类型是否合法
 * @returns 错误信息，如果合法则返回 undefined
 */
export function checkComparisonOperation(
	op: string,
	leftType: MeaoiuType,
	rightType: MeaoiuType
): string | undefined {
	// '==' 和 '!=' 允许不同类型
	if (op === '==' || op === '!=') return undefined; // 合法

	// 其他比较符必须同类
	if (leftType !== rightType) {
		return `'${op}' 操作符只能给同类用喵! ${leftType} 和 ${rightType} 不可以喵!`;
	}

	// 且只能是数字或字符串
	if (leftType !== typeMap.number && leftType !== typeMap.string) {
		return `'${op}' 操作符只能用在 ${typeMap.number} 或 ${typeMap.string} 上喵!`;
	}

	return undefined; // 合法
}