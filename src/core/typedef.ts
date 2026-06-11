// src/core/typedef.ts

import { Environment } from './run/environment.js';
import { TokenKind, type ArithmeticTokenKind, type ComparisonTokenKind, type Token } from './lexer/tokenizer.js';

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
	if (v == null) return MeaoiuType.NULL;
	if (v instanceof Environment) return MeaoiuType.COLLECTION;
	if (v !== v) return MeaoiuType.UNKNOWN;
	return typeMap[typeof v as TypeMapKey] ?? MeaoiuType.UNKNOWN;
}

/**
 * 检查算术运算的类型是否合法
 * @returns 错误信息，如果合法则返回 undefined
 */
export function checkArithmeticOperation(
	op: Token<ArithmeticTokenKind>,
	leftType: MeaoiuType,
	rightType: MeaoiuType,
): string | undefined {
	if (leftType !== rightType) {
		return `「${op.value}」操作符只能给同类用喵！「${typeNames[leftType]}」和「${typeNames[rightType]}」不可以喵！`;
	}

	if (leftType === MeaoiuType.NUMBER) return undefined; // 数字可以做任何运算

	switch (op.kind) {
		case TokenKind.ARITHMETIC_PLUS:
			if (leftType === MeaoiuType.STRING || leftType === MeaoiuType.COLLECTION) return undefined;
			return `「${op.value}」操作符只能用在「${typeNames[MeaoiuType.NUMBER]}」、「${typeNames[MeaoiuType.STRING]}」或「${
				typeNames[MeaoiuType.COLLECTION]
			}」上喵！`;
		case TokenKind.ARITHMETIC_MINUS:
		case TokenKind.ARITHMETIC_MULTIPLY:
		case TokenKind.ARITHMETIC_DIVIDE:
			return `「${op.value}」操作符只能用于两个「${typeNames[MeaoiuType.NUMBER]}」之间喵！`;
		default:
			const _o: never = op;
			return `「${_o}」怎么会是操作符喵？`;
	}
}

/**
 * 检查比较运算的类型是否合法
 * @returns 错误信息，如果合法则返回 undefined
 */
export function checkComparisonOperation(
	op: Token<ComparisonTokenKind>,
	leftType: MeaoiuType,
	rightType: MeaoiuType,
): string | undefined {
	// '==' 和 '!=' 允许不同类型
	const opKind = op.kind;
	if (opKind === TokenKind.COMPARISON_EQUAL || opKind === TokenKind.COMPARISON_NOT_EQUAL) return undefined; // 合法

	// 其他比较符必须同类
	if (leftType !== rightType) {
		return `「${op.value}」操作符只能给同类用喵！「${typeNames[leftType]}」和「${typeNames[rightType]}」不可以喵！`;
	}

	// 且只能是数字或字符串
	if (leftType !== MeaoiuType.NUMBER && leftType !== MeaoiuType.STRING) {
		return `「${op.value}」操作符只能用在「${typeNames[MeaoiuType.NUMBER]}」或「${typeNames[MeaoiuType.STRING]}」上喵！`;
	}

	return undefined; // 合法
}
