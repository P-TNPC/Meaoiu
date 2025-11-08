// src/core/builtIns.ts

import { Environment } from './run/environment.js';
import type { MeaoiuRuntimeIO } from './run/io.js';
import { getMeaoiuType, MeaoiuType, typeNames, type MeaoiuValue } from './typedef.js';

export const builtInFunctionNames = [
	'喵',
	'祈求',
	'呼噜',
	'磨爪',
	'变摸数',
	'喵译',
	'嗅嗅',
	'才怪',
	'理直气壮',
	'差不多',
	'抢大的',
	'吃剩的',
	'摸余',
	'找尾巴',
	'喵语连珠',
	'打盹',
	'添乱',
	'猫咪艺术',
	'哈气',
] as const;
type BuiltInFunctionName = (typeof builtInFunctionNames)[number];
type MeaoiuBuiltIn = (args: MeaoiuValue[]) => MeaoiuValue | Promise<MeaoiuValue>;
export type BuiltInFunctions = Record<BuiltInFunctionName, MeaoiuBuiltIn>;
const BuiltInFunctionNameSet = new Set(builtInFunctionNames);

export function isBuiltInFunctionName(name: string): name is BuiltInFunctionName {
	return (BuiltInFunctionNameSet as Set<string>).has(name);
}

export const createBuiltInFunctions = (io: MeaoiuRuntimeIO): BuiltInFunctions => ({
	// I/O
	喵: args => (io.print(args), null),
	祈求: async args => io.prompt((args[0] as string | undefined) ?? '> '),

	// Type Conversion
	变摸数: args => {
		const num = parseFloat(args[0] as string);
		return Number.isNaN(num) ? null : num;
	},
	喵译: args => String(args[0]),
	嗅嗅: args => typeNames[getMeaoiuType(args[0])],

	// Logic
	才怪: args => !args[0], // not

	// Math
	理直气壮: args => Math.abs(args[0] as number),
	差不多: args => Math.round(args[0] as number),
	抢大的: args => Math.max(...(args as number[])),
	吃剩的: args => Math.min(...(args as number[])),
	摸余: args => (args[0] as number) % (args[1] as number),

	// Collection & String
	找尾巴: args => {
		const target = args[0] as string | Environment;
		return getMeaoiuType(target) === MeaoiuType.COLLECTION
			? (target as Environment).orderedVariableNames.length
			: String(target).length;
	},
	// String
	喵语连珠: args => args.map(String).join(''),

	// Thematic & Time
	打盹: async args => {
		const ms = ((args[0] as number | undefined) ?? 1) * 1000;
		await new Promise<void>(resolve => setTimeout(resolve, ms));
		return null;
	},
	磨爪: _args => (io.print([' /\\_/\\ \n( >.< )\n-=(|)=-  --< scratching sounds >--']), null),
	呼噜: args => {
		const times = (args[0] as number | undefined) ?? Math.ceil(Math.random() * 3);
		for (let i = 0; i < times; i++) {
			io.print(['咕噜...咕噜...']);
		}
		return null;
	},
	添乱: args => {
		const [min = 0, max = Number.MAX_SAFE_INTEGER] = args as number[];
		return Math.floor(Math.random() * (max - min + 1)) + min;
	},
	猫咪艺术: args => {
		const style = args[0] ?? '开心';
		if (style === '开心') io.print([' /\\_/\\ \n( ^.^ )\n > ^ < ']);
		else io.print([' /\\_/\\ \n( o.o )\n > ^ < ']);
		return null;
	},
	哈气: args => {
		throw new Error(...(args as string[]));
	},
});
