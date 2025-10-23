// src/core/typedef.ts

import { Environment } from "./run/environment.js";

export type MeaoiuType = '摸数' | '闲话' | '好坏' | '空碗' | '计谋' | '集合' | '不懂';

// 定义严格的映射对象类型
type TypeMapKey = 'number' | 'string' | 'boolean' | 'null' | 'function' | 'collection' | 'unknown';
type StrictTypeMap = { [K in TypeMapKey]: MeaoiuType };

export const typeMap: StrictTypeMap = {
	number: '摸数',
	string: '闲话',
	boolean: '好坏',
	null: '空碗',
	function: '计谋',
	collection: '集合',
	unknown: '不懂',
} as const;

export function getMeaoiuType(v: unknown): MeaoiuType {
	if (v === null || v === undefined) return typeMap.null;
	if (v instanceof Environment) return typeMap.collection;
	const t = typeof v;
	if (t in typeMap) return typeMap[t as TypeMapKey];
	return typeMap.unknown;
}
