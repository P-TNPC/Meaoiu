// src/core/builtIns.ts
import type { MeaoiuRuntimeIO } from './io.js';

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
export type BuiltInFunctions = Record<(typeof builtInFunctionNames)[number], (args: any[]) => any>;

export function isBuiltInFunctionName(name: string): name is (typeof builtInFunctionNames)[number] {
	return (builtInFunctionNames as readonly string[]).includes(name);
}

export const createBuiltInFunctions = (io: MeaoiuRuntimeIO): BuiltInFunctions => ({
	// I/O
	喵: (args: any[]) => io.print(args),
	祈求: async (args: any[]) => {
		return io.prompt(args[0] ?? '> ');
	},

	// Type Conversion
	变摸数: (args: any[]) => {
		const num = parseFloat(args[0]);
		return isNaN(num) ? null : num;
	},
	喵译: (args: any[]) => {
		return String(args[0]);
	},
	嗅嗅: (args: any[]) => {
		// typeof
		if (args[0] === null) return '空碗';
		if (typeof args[0] === 'number') return '摸数';
		if (typeof args[0] === 'string') return '闲话';
		if (typeof args[0] === 'boolean') return '好坏';
		return '不懂';
	},

	// Logic
	才怪: (args: any[]) => !args[0], // not

	// Math
	理直气壮: (args: any[]) => Math.abs(args[0]),
	差不多: (args: any[]) => Math.round(args[0]),
	抢大的: (args: any[]) => Math.max(...args),
	吃剩的: (args: any[]) => Math.min(...args),
	摸余: (args: any[]) => args[0] % args[1],

	// String
	找尾巴: (args: any[]) => String(args[0]).length,
	喵语连珠: (args: any[]) => args.map(String).join(''),

	// Thematic & Time
	打盹: (args: any[]) => {
		const ms = (args[0] ?? 1) * 1000;
		const start = Date.now();
		while (Date.now() - start < ms) {}
	},
	磨爪: (_args: any[]) => io.print([' /\\_/\\ \n( >.< )\n-=(|)=-  --< scratching sounds >--']),
	呼噜: (args: any[]) => {
		const times = args[0] ?? Math.ceil(Math.random() * 3);
		for (let i = 0; i < times; i++) {
			io.print(['咕噜...咕噜...']);
		}
	},
	添乱: (args: any[]) => {
		const [min, max] = args;
		return Math.floor(Math.random() * (max - min + 1)) + min;
	},
	猫咪艺术: (args: any[]) => {
		const style = args[0] ?? '开心';
		if (style === '开心') io.print([' /\\_/\\ \n( ^.^ )\n > ^ < ']);
		else io.print([' /\\_/\\ \n( o.o )\n > ^ < ']);
	},
	哈气: (args: any[]) => {
		throw new Error(...args);
	},
});
