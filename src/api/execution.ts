// src/api/services/execution.ts

import { createBuiltInFunctions } from '../core/builtIns.js';
import { Parser } from '../core/parser.js';
import { Environment } from '../core/run/environment.js';
import { evaluate } from '../core/run/interpreter.js';
import { createRuntimeIO, type IOConfig } from '../core/run/io.js';
import { LogLevel, setLogLevel } from '../core/run/logger.js';
import { tokenize } from '../core/tokenizer.js';

type RunOptions = {
	useOnebased?: boolean;
	logLevel?: LogLevel;
};
async function execute(
	sourceCode: string,
	ioConfig: IOConfig,
	{ useOnebased = true, logLevel = LogLevel.WARN }: RunOptions = {},
): Promise<void> {
	setLogLevel(logLevel);
	const ast = new Parser(tokenize(sourceCode, { useOnebased })).parse().program;
	const globalEnv = new Environment();
	const builtIns = createBuiltInFunctions(createRuntimeIO(ioConfig));
	await evaluate(ast, globalEnv, builtIns, {});
}

export { execute, IOConfig, LogLevel, RunOptions };
