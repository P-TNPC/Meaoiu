// src/core/builtIns.ts

import type { MeaoiuRuntimeIO } from './run/io.js';
import { getMeaoiuType, typeMap } from './typedef.js';

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
export type BuiltInFunctions = Record<BuiltInFunctionName, (args: any[]) => any>;

export function isBuiltInFunctionName(name: string): name is BuiltInFunctionName {
	return (builtInFunctionNames as readonly string[]).includes(name);
}

export const createBuiltInFunctions = (io: MeaoiuRuntimeIO): BuiltInFunctions => ({
	// I/O
	喵: args => io.print(args),
	祈求: async args => io.prompt(args[0] ?? '> '),

	// Type Conversion
	变摸数: args => {
		const num = parseFloat(args[0]);
		return Number.isNaN(num) ? null : num;
	},
	喵译: args => String(args[0]),
	嗅嗅: args => getMeaoiuType(args[0]),

	// Logic
	才怪: args => !args[0], // not

	// Math
	理直气壮: args => Math.abs(args[0]),
	差不多: args => Math.round(args[0]),
	抢大的: args => Math.max(...args),
	吃剩的: args => Math.min(...args),
	摸余: args => args[0] % args[1],

	// Collection & String
	找尾巴: args => {
		const target = args[0];
		return getMeaoiuType(target) === typeMap.collection ? target.orderedVariableNames.length : String(target).length;
	},
	// String
	喵语连珠: args => args.map(String).join(''),

	// Thematic & Time
	打盹: async args => {
		const ms = (args[0] ?? 1) * 1000;
		await new Promise<void>(resolve => setTimeout(resolve, ms));
	},
	磨爪: _args => io.print([' /\\_/\\ \n( >.< )\n-=(|)=-  --< scratching sounds >--']),
	呼噜: args => {
		const times = args[0] ?? Math.ceil(Math.random() * 3);
		for (let i = 0; i < times; i++) {
			io.print(['咕噜...咕噜...']);
		}
	},
	添乱: args => {
		const [min, max] = args;
		return Math.floor(Math.random() * (max - min + 1)) + min;
	},
	猫咪艺术: args => {
		const style = args[0] ?? '开心';
		if (style === '开心') io.print([' /\\_/\\ \n( ^.^ )\n > ^ < ']);
		else io.print([' /\\_/\\ \n( o.o )\n > ^ < ']);
	},
	哈气: args => {
		throw new Error(...args);
	},
});

// function paramsCheck(args: any[], typesList: MeaoiuType[][]) {
// 	if (args.length < typesList.length) throw new Error(`只给 ${args.length} 个贡品不够喵！需要 ${typesList.length} 个`);
// 	for (let i = 0; i < typesList.length; i++) {
// 		const arg = args[i];
// 		const types = typesList[i]!;
// 		const type = getMeaoiuType(arg);
// 		if (!types.includes(type)) throw new Error(`第 ${i + 1} 个贡品 ${arg} 是 ${type}，需要 ${types.join(' 或 ')}`);
// 	}
// }
