// src/core/run/io.ts

// I/O 接口
export type MeaoiuRuntimeIO = {
	print: (args: unknown[]) => void;
	prompt: (question: string) => Promise<string>;
};

type Styleizer = typeof colorize;
/**
 * 输入输出配置
 */
export type IOConfig = {
	onPrint: (formattedString: string) => void;
	onPrompt: (question: string) => Promise<string>;
	/** 为输出的各类值附加样式，默认以ANSI 颜色输出，@default true */
	styleize?: Styleizer | boolean;
};

// ANSI 颜色代码
const enum Color {
	RESET = '\x1b[0m',
	YELLOW = '\x1b[33m',
	DIM = '\x1b[2m',
	GREEN = '\x1b[32m',
}

// Meaoiu 字符串转换器
function toMeaoiuString(value: unknown): string {
	if (value === true) return '好喵';
	if (value === false) return '坏喵';
	if (value == null) return '空碗';
	if (value !== value) return '不懂';
	return String(value);
}

// 上色
function colorize(value: unknown, strValue: string): string {
	if (value == null) return `${Color.DIM}${strValue}${Color.RESET}}`;

	switch (typeof value) {
		case 'number':
		case 'boolean':
			return `${Color.YELLOW}${strValue}${Color.RESET}`;
		case 'string':
			return `${Color.GREEN}${strValue}${Color.RESET}`;
		default:
			return strValue;
	}
}

// I/O 工厂函数
export function createRuntimeIO({ onPrint, onPrompt, styleize = true }: IOConfig): MeaoiuRuntimeIO {
	const styleizer: Styleizer | false = styleize === true ? colorize : styleize;
	const argToString = styleizer ? (arg: unknown) => styleizer(arg, toMeaoiuString(arg)) : toMeaoiuString;
	return { prompt: onPrompt, print: args => onPrint(args.map(argToString).join(' ')) };
}
