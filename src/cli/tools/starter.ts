// src/cli/tools/starter.ts

import type { BuiltInFunctions } from '../../core/builtIns.js';
import { tokenize } from '../../core/tokenizer.js';
import { Parser } from '../../core/parser.js';
import { Environment } from '../../core/run/environment.js';
import { evaluate } from '../../core/run/interpreter.js';
import { formatError } from './toolUtils.js';

export async function run(sourceCode: string, builtIns: BuiltInFunctions, filePath: string) {
	if (!sourceCode.trim()) return console.log('没有字喵！');
	console.log('=============================');
	console.log('执行 Meaoiu 代码...');
	console.log('=============================');
	try {
		const tokens = tokenize(sourceCode, { ignoreComments: true });
		const parser = new Parser(tokens);
		const { program: ast } = parser.parse();
		const globalEnv = new Environment();
		await evaluate(ast, globalEnv, builtIns);
	} catch (e: any) {
		console.error(formatError(e, sourceCode, filePath));
	}
	console.log('=============================\n');
}
