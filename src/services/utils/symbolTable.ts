// src/services/utils/symbolTable.ts

import type * as AST from '../../core/ast.js';
import type { MeaoiuType } from '../../core/typedef.js';

export const enum SymbolKind {
	FUNCTION = 12,
	VARIABLE = 13,
	PARAMETER = 20, // 借用 Key 的值
}

export const enum SymbolTag {
	NORMAL = 0,
	MOVED = 1,
	DECAYED = 2,
}

// 描述一个符号（变量、计谋等）的信息
export interface SymbolInfo {
	name: string;
	kind: SymbolKind;
	tag: SymbolTag;
	type: MeaoiuType;
	valueRef?: SymbolInfo | undefined;
	declarations: AST.Identifier[]; // 在哪里声明的
	references: AST.Identifier[]; // 在哪里被引用的
	isBuiltIn?: boolean; // 是否自家喵
}

// 描述一个作用域
export interface Scope {
	parent?: Scope; // 父作用域
	children: Scope[]; // 子作用域
	symbols: Map<string, SymbolInfo>; // 在本作用域内声明的符号
}
