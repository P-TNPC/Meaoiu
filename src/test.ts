import { tokenize } from './core/tokenizer.js';
import { Parser } from './core/parser.js';
import { Environment } from './core/environment.js';
import { evaluate } from './core/interpreter.js';
import { createBuiltInFunctions } from './core/builtIns.js';
import type { MeaoiuRuntimeIO } from './core/io.js';
import * as readlineSync from 'readline-sync';

const code = `蹭 a 就是 10~
蹭 b 就是 "hello"~

(下一行是语法错误：缺少了 '~')
扒[=a=]喵~

(下一行是运行时错误：数字和字符串不能相加)
蹭 c 就是 a + b~
`;

// --- The rest of main.ts ---
const cliIO: MeaoiuRuntimeIO = {
    print: (args: string[]) => console.log(...args),
    prompt: (question: string) => readlineSync.question(question),
};

function run(sourceCode: string, io: MeaoiuRuntimeIO) {
    console.log("=============================");
    console.log("执行 Meaoiu 代码:\n", sourceCode.trim());
    console.log("--- 输出 ---");
    try {
        const tokens = tokenize(sourceCode, { ignoreComments: true });
        const parser = new Parser(tokens);
        const { program: ast } = parser.parse();
        const globalEnv = new Environment();
        const builtIns = createBuiltInFunctions(io);
        evaluate(ast, globalEnv, builtIns);
    } catch (e: any) {
        console.error("坏了喵:", e.message);
    }
    console.log("=============================\n");
}

run(code, cliIO);