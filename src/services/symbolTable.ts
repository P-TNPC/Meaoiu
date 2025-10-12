// src/lsp-services/symbolTable.ts
import type * as AST from '../core/ast.js';

export type MeaoiuType = '摸数' | '闲话' | '好坏' | '空碗' | '计谋' | '不懂';

// 描述一个符号（变量、计谋等）的信息
export interface SymbolInfo {
	name: string;
	kind: 'variable' | 'function' | 'parameter';
	type: MeaoiuType;
	declarations: AST.AstNode[]; // 在哪里声明的
	references: AST.AstNode[]; // 在哪里被引用的
	isBuiltIn?: boolean; // 是否自家喵
	isMoved?: boolean; // 是否已被移走
}

// 描述一个作用域
export interface Scope {
	parent?: Scope; // 父作用域
	children: Scope[]; // 子作用域
	symbols: Map<string, SymbolInfo>; // 在本作用域内声明的符号
}
