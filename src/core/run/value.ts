// src/core/run/types.ts

import { NodeType } from '../ast.js';
import type { MeaoiuValue } from '../typedef.js';
import type { Environment } from './environment.js';

export type ReferenceLink = { isReference: true; scope: Environment; name: string };
export type VariableValue = ReferenceLink | MeaoiuValue;
export type EnvVariable = { value: VariableValue; moved: boolean }; // 仅用于环境内部储存，不传递喵

export const BREAK_SIGNAL = { type: NodeType.BreakStatement } as const; // '累了~'
export const CONTINUE_SIGNAL = { type: NodeType.AmbushStatement } as const; //'偷袭~'
// 可套娃的带值信号，将未实现的想法上交喵（动作 [#动作~#]~）
export class ReturnValue {
	constructor(public value: Evaluated) {}
} // '叼回来 [值]~'
export class LoopValue {
	constructor(public value: Evaluated) {}
} // '偷袭 <值>~'

type Signal = typeof BREAK_SIGNAL | typeof CONTINUE_SIGNAL | ReturnValue | LoopValue;
export type Evaluated = VariableValue | Signal;

export function isReferenceLink(value: Evaluated): value is ReferenceLink {
	return !!(value as ReferenceLink | null)?.isReference;
}

export function isSignal(value: Evaluated): value is Signal {
	return value instanceof ReturnValue || value === BREAK_SIGNAL || value instanceof LoopValue || value === CONTINUE_SIGNAL;
}
