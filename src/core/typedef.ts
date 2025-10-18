// src/core/typedef.ts

export type MeaoiuType = '摸数' | '闲话' | '好坏' | '空碗' | '计谋' | '集合' | '不懂';

// 定义严格的映射对象类型
type TypeMapKey = 'number' | 'string' | 'boolean' | 'null' | 'function' | 'collection' | 'unknown';
type StrictTypeMap = { [K in TypeMapKey]: MeaoiuType };

export const typeMap: StrictTypeMap = {
	number: '摸数',
	string: '闲话',
	boolean: '好坏',
	collection: '集合',
	null: '空碗',
	function: '计谋',
	unknown: '不懂',
} as const;

export function getMeaoiuType(v: unknown): MeaoiuType {
	if (v === null || v === undefined) return typeMap.null;
	const t = typeof v;
	if (t in typeMap) return typeMap[t as TypeMapKey];
	return typeMap.unknown;
}
