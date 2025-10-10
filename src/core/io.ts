// src/core/io.ts

// 定义所有 Meaoiu 运行时环境必须提供的 I/O 功能
export interface MeaoiuRuntimeIO {
	// 输出计谋：接收一个字符串数组并进行打印
	print: (args: string[]) => void;
	// 输入计谋：接收一个问题字符串，并返回用户的输入
	prompt: (question: string) => string;
}
