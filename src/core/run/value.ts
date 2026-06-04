// src/core/run/types.ts

import type { MeaoiuValue } from '../typedef.js';
import type { Environment } from './environment.js';

export type ReferenceLink = { isReference: true; scope: Environment; name: string };
export type VariableValue = ReferenceLink | MeaoiuValue;
export type EnvVariable = { value: VariableValue; moved: boolean }; // 仅用于环境内部储存，不传递喵

export const enum SignalKind {
	RETURN,
	LOOP,
	BREAK,
	CONTINUE,
}
abstract class Signal<K extends SignalKind> {
	constructor(public readonly signalKind: K) {}
}
// '叼回来 [值]~'
export class ReturnValue extends Signal<SignalKind.RETURN> {
	constructor(public readonly value: Evaluated) {
		super(SignalKind.RETURN);
	}
}
// '偷袭 <值>~'
export class LoopValue extends Signal<SignalKind.LOOP> {
	constructor(public readonly value: Evaluated) {
		super(SignalKind.LOOP);
	}
}
export class EmptySignal<K extends SignalKind.BREAK | SignalKind.CONTINUE> extends Signal<K> {
	constructor(kind: K) {
		super(kind);
	}
}
export const BREAK_SIGNAL = new EmptySignal(SignalKind.BREAK); // '累了~'
export const CONTINUE_SIGNAL = new EmptySignal(SignalKind.CONTINUE); //'偷袭~'

type ControlSignal = ReturnValue | LoopValue | EmptySignal<SignalKind.BREAK> | EmptySignal<SignalKind.CONTINUE>;
export type Evaluated = VariableValue | ControlSignal;

export function isReferenceLink(value: Evaluated): value is ReferenceLink {
	return !!(value as ReferenceLink | null)?.isReference;
}
export function isSignal(value: Evaluated): value is ControlSignal {
	return value instanceof Signal;
}
