// src/core/builtIns.ts

import { Environment } from './run/environment.js';
import type { MeaoiuRuntimeIO } from './run/io.js';
import { getMeaoiuType, MeaoiuType, typeNames, type MeaoiuValue } from './typedef.js';

export const MeaoiuBuiltInNames = [
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
type BuiltInName = (typeof MeaoiuBuiltInNames)[number];
type BuiltInFunction = (args: MeaoiuValue[]) => MeaoiuValue | Promise<MeaoiuValue>;

export type MeaoiuBuiltIns = Record<
	BuiltInName,
	{
		paramLimit: number;
		paramTypes: MeaoiuType[][];
		function: BuiltInFunction;
	}
>;

const BuiltInFunctionNameSet = new Set(MeaoiuBuiltInNames);
export function isBuiltInFunctionName(name: string): name is BuiltInName {
	return (BuiltInFunctionNameSet as Set<string>).has(name);
}

export const createBuiltInFunctions = (io: MeaoiuRuntimeIO): MeaoiuBuiltIns => ({
	// I/O
	喵: {
		paramLimit: 0,
		paramTypes: [],
		function: args => (io.print(args), null),
	},
	祈求: {
		paramLimit: 0,
		paramTypes: [[MeaoiuType.STRING]],
		function: async ([question]) => io.prompt((question as string | undefined) ?? '> '),
	},

	// Type Conversion
	变摸数: {
		paramLimit: 1,
		paramTypes: [[MeaoiuType.STRING]],
		function: ([string]) => {
			const num = Number.parseFloat(string as string);
			return Number.isNaN(num) ? null : num;
		},
	},
	喵译: {
		paramLimit: 1,
		paramTypes: [],
		function: ([value]) => String(value),
	},
	嗅嗅: {
		paramLimit: 1,
		paramTypes: [],
		function: ([value]) => typeNames[getMeaoiuType(value)],
	},

	// Logic
	才怪: {
		paramLimit: 1,
		paramTypes: [],
		function: ([value]) => !value, // not
	},

	// Math
	理直气壮: {
		paramLimit: 1,
		paramTypes: [[MeaoiuType.NUMBER]],
		function: ([x]) => Math.abs(x as number),
	},
	差不多: {
		paramLimit: 1,
		paramTypes: [[MeaoiuType.NUMBER]],
		function: ([x]) => Math.round(x as number),
	},
	抢大的: {
		paramLimit: 1,
		paramTypes: [[MeaoiuType.NUMBER] /* 末尾组将用于验证后续所有参数 */],
		function: values => Math.max(...(values as number[])),
	},
	吃剩的: {
		paramLimit: 1,
		paramTypes: [[MeaoiuType.NUMBER]],
		function: values => Math.min(...(values as number[])),
	},
	摸余: {
		paramLimit: 2,
		paramTypes: [[MeaoiuType.NUMBER], [MeaoiuType.NUMBER]],
		function: ([x, y]) => {
			// 震惊！「%」不是「modulo」，再叫「取模」打死！「moduli」是「modulus」的复数形式！
			const remainder = (x as number) % (y as number);
			return Number.isNaN(remainder) ? null : remainder;
		},
	},
	添乱: {
		paramLimit: 0,
		paramTypes: [[MeaoiuType.NUMBER], [MeaoiuType.NUMBER]],
		function: ([min = 0, max = Number.MAX_SAFE_INTEGER]) => {
			return Math.floor(Math.random() * ((max as number) - (min as number) + 1)) + (min as number);
		},
	},

	// Collection & String
	找尾巴: {
		paramLimit: 1,
		paramTypes: [[MeaoiuType.COLLECTION, MeaoiuType.STRING], [] /* 空组令多传的参数不被检查 */],
		function: ([target]) => (target as string | Environment).length,
	},
	// String
	喵语连珠: {
		paramLimit: 0,
		paramTypes: [[MeaoiuType.STRING]],
		function: strings => strings.join(''),
	},

	// Thematic & Time
	打盹: {
		paramLimit: 0,
		paramTypes: [[MeaoiuType.NUMBER]],
		function: async ([second = 1]) => {
			const ms = (second as number) * 1000;
			await new Promise<void>(resolve => setTimeout(resolve, ms));
			return null;
		},
	},
	磨爪: {
		paramLimit: 0,
		paramTypes: [],
		function: () => (io.print([' /\\_/\\ \n( >.< )\n-=(|)=-  --< scratching sounds >--']), null),
	},
	呼噜: {
		paramLimit: 0,
		paramTypes: [[MeaoiuType.NUMBER]],
		function: ([times = Math.ceil(Math.random() * 3)]) => {
			for (let i = 0; i < (times as number); i++) io.print(['咕噜...咕噜...']);
			return null;
		},
	},
	猫咪艺术: {
		paramLimit: 0,
		paramTypes: [],
		function: ([style = '开心']) => {
			io.print(style === '开心' ? [' /\\_/\\ \n( ^.^ )\n > ^ < '] : [' /\\_/\\ \n( o.o )\n > ^ < ']);
			return null;
		},
	},
	哈气: {
		paramLimit: 0,
		paramTypes: [[MeaoiuType.STRING, MeaoiuType.NULL]],
		function: ([message]) => {
			throw new Error(message as string);
		},
	},
});

export function checkArgsForBuiltIn(builtIn: MeaoiuBuiltIns[BuiltInName], args: MeaoiuValue[]): string | undefined {
	const { paramLimit, paramTypes } = builtIn;
	if (args.length < paramLimit) return `要 ${paramLimit} 个贡品，只给 ${args.length} 个不够喵！`;
	const MAX_INDEX_T = paramTypes.length - 1;
	if (MAX_INDEX_T < 0) return undefined;

	check: for (let i = 0; i < args.length; i++) {
		const paramType = paramTypes[Math.min(i, MAX_INDEX_T)]!;
		if (paramType.length < 1) continue;

		const argType = getMeaoiuType(args[i]!);
		for (const type of paramType) if (type === argType) continue check;

		return `第 ${i + 1} 个贡品是「${typeNames[argType]}」，但想要的是「${paramType
			.map(type => typeNames[type])
			.join('」或「')}」喵！`;
	}
	return undefined;
}
