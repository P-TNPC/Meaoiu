// src/core/interpreter.ts
import * as AST from './ast.js';
import { Environment } from './environment.js';
import { type BuiltInFunctions, isBuiltInFunctionName } from './builtIns.js';

const BREAK_SIGNAL = { type: 'BREAK_SIGNAL' };
class ReturnValue {
	constructor(public value: any) {}
}

export function evaluate(node: AST.AstNode, env: Environment, builtIns: BuiltInFunctions): any {
	try {
		switch (node.type) {
			case 'NumericLiteral':
				return (node as AST.NumericLiteral).value;
			case 'StringLiteral':
				return (node as AST.StringLiteral).value;
			case 'BooleanLiteral':
				return (node as AST.BooleanLiteral).value;
			case 'NullLiteral':
				return null;
			case 'Identifier':
				return env.lookup((node as AST.Identifier).symbol);
			case 'Program':
				let lastEvaluatedInProgram: any;
				for (const statement of (node as AST.Program).body) {
					lastEvaluatedInProgram = evaluate(statement, env, builtIns);
				}
				return lastEvaluatedInProgram;
			case 'BlockStatement': {
				// 为块创建一个新的、独立的子作用域！
				const blockEnv = new Environment(env);
				let lastEvaluatedInBlock: any = null; // 默认为 null (空碗)

				for (const stmt of (node as AST.BlockStatement).body) {
					lastEvaluatedInBlock = evaluate(stmt, blockEnv, builtIns);

					// 如果块内部有 `叼回来`，立刻中断并返回值
					if (lastEvaluatedInBlock instanceof ReturnValue) {
						return lastEvaluatedInBlock.value; // 直接返回解包后的值
					}

					// Break 信号依然需要向上传递给循环
					if (lastEvaluatedInBlock === BREAK_SIGNAL) {
						return BREAK_SIGNAL;
					}
				}

				// 块的返回值是最后一个语句的返回值（如果它有的话）
				return env.resolveValue(lastEvaluatedInBlock);
			}
			case 'SequenceExpression': {
				const seqExpr = node as AST.SequenceExpression;
				let accumulator = env.resolveValue(evaluate(seqExpr.sections[0]!, env, builtIns));
				for (let i = 0; i < seqExpr.operators.length; i++) {
					const operator = seqExpr.operators[i]!.value;
					const rightHandSide = env.resolveValue(evaluate(seqExpr.sections[i + 1]!, env, builtIns));
					switch (operator) {
						case '+':
							accumulator += rightHandSide;
							break;
						case '-':
							accumulator -= rightHandSide;
							break;
						case '*':
							accumulator *= rightHandSide;
							break;
						case '/':
							accumulator /= rightHandSide;
							break;
						default:
							throw new Error(`不认识的节运算符喵: ${operator}`);
					}
				}
				return accumulator;
			}
			case 'BinaryExpression': {
				const binExpr = node as AST.BinaryExpression;
				const left = evaluate(binExpr.left, env, builtIns);
				const right = evaluate(binExpr.right, env, builtIns);

				const leftVal = env.resolveValue(left);
				const rightVal = env.resolveValue(right);

				const op = binExpr.operator;

				if (op === '+') {
					if (typeof leftVal === 'number' && typeof rightVal === 'number') {
						return leftVal + rightVal;
					}
					if (typeof leftVal === 'string' && typeof rightVal === 'string') {
						return leftVal + rightVal;
					}
					throw new Error(`'+' 操作符不能用于 ${typeof leftVal} 和 ${typeof rightVal} 之间喵!`);
				}

				if (['-', '*', '/'].includes(op)) {
					if (typeof leftVal !== 'number' || typeof rightVal !== 'number') {
						throw new Error(`'${op}' 操作符只能用于两个 '摸数' 之间喵!`);
					}
				}

				if (['>', '<', '>=', '<='].includes(op)) {
					if (typeof leftVal !== typeof rightVal) {
						throw new Error(`'${op}' 操作符不能用于不同类型之间喵!`);
					}
					if (typeof leftVal !== 'number' && typeof leftVal !== 'string') {
						throw new Error(`'${op}' 操作符只能用于 '摸数' 或 '闲话' 之间喵!`);
					}
				}
				switch (op) {
					case '-':
						return leftVal - rightVal;
					case '*':
						return leftVal * rightVal;
					case '/':
						return leftVal / rightVal;
					case '==':
						return leftVal === rightVal;
					case '>':
						return leftVal > rightVal;
					case '<':
						return leftVal < rightVal;
					case '>=':
						return leftVal >= rightVal;
					case '<=':
						return leftVal <= rightVal;
				}
				throw new Error(`是两块钱的运算符喵? ${binExpr.operator}`);
			}
			case 'LogicalExpression': {
				const logExpr = node as AST.LogicalExpression;
				const leftVal = env.resolveValue(evaluate(logExpr.left, env, builtIns));
				switch (logExpr.operator) {
					case 'AND':
						return leftVal && env.resolveValue(evaluate(logExpr.right, env, builtIns));
					case 'OR':
						return leftVal || env.resolveValue(evaluate(logExpr.right, env, builtIns));
					case 'NOR':
						return !(leftVal || env.resolveValue(evaluate(logExpr.right, env, builtIns)));
					case 'NAND':
						return !(leftVal && env.resolveValue(evaluate(logExpr.right, env, builtIns)));
				}
			}
			case 'VariableDeclaration':
				const varDec = node as AST.VariableDeclaration;
				const value = evaluate(varDec.value, env, builtIns) ?? null;
				return env.declare(varDec.identifier.symbol, value, varDec.kind);
			case 'AssignmentStatement': {
				const assignStmt = node as AST.AssignmentStatement;
				const value = evaluate(assignStmt.value, env, builtIns);
				return env.assign(assignStmt.assignee.symbol, value, assignStmt.kind);
			}
			case 'IfStatement':
				const isTrue = env.resolveValue(evaluate((node as AST.IfStatement).test, env, builtIns));
				if (isTrue) {
					return evaluate((node as AST.IfStatement).consequent, env, builtIns);
				} else if ((node as AST.IfStatement).alternate) {
					return evaluate((node as AST.IfStatement).alternate!, env, builtIns);
				}
				return null;
			case 'LoopStatement':
				while (true) {
					const result = evaluate((node as AST.LoopStatement).body, env, builtIns);
					if (result === BREAK_SIGNAL) {
						break;
					}
				}
				return;
			case 'BreakStatement':
				return BREAK_SIGNAL;
			case 'FunctionDeclaration':
				const funcDec = node as AST.FunctionDeclaration;
				env.declareFunction(funcDec.name.symbol, funcDec);
				return;
			case 'CallExpression':
				const callExpr = node as AST.CallExpression;
				const funcName = callExpr.callee.symbol;

				if (isBuiltInFunctionName(funcName)) {
					const args = callExpr.args.map((arg) => evaluate(arg.expression, env, builtIns));
					const evalArgs = args.map((arg) => env.resolveValue(arg));
					return builtIns[funcName]?.(evalArgs);
				}

				const func = env.lookupFunction(funcName);
				if (!func) {
					throw new Error(`计谋? ${funcName}`);
				}

				const functionEnv = new Environment(env);
				if (callExpr.args.length !== func.params.length) {
					throw new Error(`贡品数量?`);
				}

				for (let i = 0; i < func.params.length; i++) {
					const paramName = func.params[i]!.symbol;
					const argument = callExpr.args[i];

					if (argument?.isClone) {
						// 如果是“高仿”
						const argValue = evaluate(argument.expression, env, builtIns);
						functionEnv.declare(paramName, argValue, 'Copy');
					} else {
						// 默认是引用
						if (argument?.expression.type !== 'Identifier') {
							throw new Error("只有变量才能被引用传递喵！字面量（比如数字或字符串）必须用'高仿'。");
						}
						const varName = (argument.expression as AST.Identifier).symbol;
						const sourceScope = env.findVariableScope(varName);
						if (!sourceScope) {
							throw new Error(`找不到要引用的变量「${varName}」喵！`);
						}

						functionEnv.declareReference(paramName, sourceScope, varName);
					}
				}

				const result = evaluate(func.body, functionEnv, builtIns);
				if (result instanceof ReturnValue) {
					return result.value;
				}
				return null;
			case 'ReturnStatement': {
				const returnStmt = node as AST.ReturnStatement;
				const value = returnStmt.argument ? evaluate(returnStmt.argument, env, builtIns) : null;
				return new ReturnValue(env.resolveValue(value));
			}
			case 'ExpressionStatement': {
				return evaluate((node as AST.ExpressionStatement).expression, env, builtIns);
			}
		}
	} catch (err: any) {
		if (err.message.startsWith('[')) {
			// 如果错误已经有位置信息，直接抛出
			throw err;
		}
		// 否则，附加上当前 AST 节点的位置信息再抛出
		throw new Error(`[${node.line}:${node.col}] 运行时错误喵: ${err.message}`);
	}
}
