// src/core/typedef.ts

import { Environment } from './run/environment.js';

export type MeaoiuValue = number | string | boolean | null | Environment;

export const enum MeaoiuType {
	NUMBER, // 摸数
	STRING, // 闲话
	BOOLEAN, // 好坏
	NULL, // 空碗
	FUNCTION, // 计谋
	COLLECTION, // 纸箱
	UNKNOWN, // 不懂
}

export const typeNames = {
	[MeaoiuType.NUMBER]: '摸数',
	[MeaoiuType.STRING]: '闲话',
	[MeaoiuType.BOOLEAN]: '好坏',
	[MeaoiuType.NULL]: '空碗',
	[MeaoiuType.FUNCTION]: '计谋',
	[MeaoiuType.COLLECTION]: '纸箱',
	[MeaoiuType.UNKNOWN]: '不懂',
} as const satisfies Record<MeaoiuType, string>;

type TypeMapKey = Lowercase<keyof typeof MeaoiuType>;
const typeMap = {
	number: MeaoiuType.NUMBER,
	string: MeaoiuType.STRING,
	boolean: MeaoiuType.BOOLEAN,
	null: MeaoiuType.NULL,
	function: MeaoiuType.FUNCTION,
	collection: MeaoiuType.COLLECTION,
	unknown: MeaoiuType.UNKNOWN,
} as const satisfies Record<TypeMapKey, MeaoiuType>;

export function getMeaoiuType(v: unknown): MeaoiuType {
	if (v === null || v === undefined) return MeaoiuType.NULL;
	if (v instanceof Environment) return MeaoiuType.COLLECTION;
	const t = typeof v;
	if (t in typeMap) return typeMap[t as TypeMapKey];
	return MeaoiuType.UNKNOWN;
}

/**
 * 检查算术运算的类型是否合法
 * @returns 错误信息，如果合法则返回 undefined
 */
export function checkArithmeticOperation(op: string, leftType: MeaoiuType, rightType: MeaoiuType): string | undefined {
	if (leftType !== rightType) {
		return `「${op}」操作符只能给同类用喵！「${typeNames[leftType]}」和「${typeNames[rightType]}」不可以喵！`;
	}

	if (leftType === MeaoiuType.NUMBER) return undefined; // 数字可以做任何运算

	if (['-', '*', '/'].includes(op)) {
		return `「${op}」操作符只能用于两个「${typeNames[MeaoiuType.NUMBER]}」之间喵！`;
	}

	if (op === '+' && leftType !== MeaoiuType.STRING && leftType !== MeaoiuType.COLLECTION) {
		return `「${op}」操作符只能用在「${typeNames[MeaoiuType.NUMBER]}」、「${typeNames[MeaoiuType.STRING]}」或「${
			typeNames[MeaoiuType.COLLECTION]
		}」上喵！`;
	}

	return undefined; // 合法
}

/**
 * 检查比较运算的类型是否合法
 * @returns 错误信息，如果合法则返回 undefined
 */
export function checkComparisonOperation(op: string, leftType: MeaoiuType, rightType: MeaoiuType): string | undefined {
	// '==' 和 '!=' 允许不同类型
	if (op === '==' || op === '!=') return undefined; // 合法

	// 其他比较符必须同类
	if (leftType !== rightType) {
		return `「${op}」操作符只能给同类用喵！「${typeNames[leftType]}」和「${typeNames[rightType]}」不可以喵！`;
	}

	// 且只能是数字或字符串
	if (leftType !== MeaoiuType.NUMBER && leftType !== MeaoiuType.STRING) {
		return `「${op}」操作符只能用在「${typeNames[MeaoiuType.NUMBER]}」或「${typeNames[MeaoiuType.STRING]}」上喵！`;
	}

	return undefined; // 合法
}
