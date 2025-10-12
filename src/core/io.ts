// src/core/io.ts

// I/O 接口
export interface MeaoiuRuntimeIO {
	print: (args: any[]) => void;
	prompt: (question: string) => Promise<string>;
}

// 工厂函数的配置项
export interface IOConfig {
	onPrint: (formattedString: string) => void; // 底层打印回调
	onPrompt: (question: string) => Promise<string>; // 底层提问回调
	useColor?: boolean; // 是否上色
}

// ANSI 颜色代码
const colors = {
	reset: '\x1b[0m',
	yellow: '\x1b[33m',
	dim: '\x1b[2m',
	green: '\x1b[32m',
};

// Meaoiu 字符串转换器
function toMeaoiuString(value: any): string {
	if (value === true) return '好喵';
	if (value === false) return '坏喵';
	if (value === null || value === undefined) return '空碗';
	return String(value);
}

// 上色
function colorize(value: any, strValue: string): string {
	if (value === null || value === undefined) {
		return `${colors.dim}${strValue}${colors.reset}`;
	}
	switch (typeof value) {
		case 'number':
		case 'boolean':
			return `${colors.yellow}${strValue}${colors.reset}`;
		case 'string':
			return `${colors.green}${strValue}${colors.reset}`;
		default:
			return strValue;
	}
}

// I/O 工厂函数
export function createRuntimeIO(config: IOConfig): MeaoiuRuntimeIO {
	const useColor = config.useColor ?? true;

	return {
		prompt: (question: string) => config.onPrompt(question),
		print: (args: any[]) => {
			const outputString = args.map(arg => {
				// 流水线开始：原始值 -> Meaoiu字符串 -> 上色 (若需)
				let strValue = toMeaoiuString(arg);
				return useColor ? colorize(arg, strValue) : strValue;
			}).join(' ');

			config.onPrint(outputString);
		},
	};
}
