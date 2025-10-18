// src/core/run/interpreter.ts

import type * as AST from '../ast.js';
import { Environment } from './environment.js';
import { type BuiltInFunctions, isBuiltInFunctionName } from '../builtIns.js';
import { getMeaoiuType, typeMap } from '../typedef.js';

const BREAK_SIGNAL = { type: 'BREAK_SIGNAL' };
class ReturnValue {
	constructor(public value: any) {}
}

export async function evaluate(node: AST.AstNode, env: Environment, builtIns: BuiltInFunctions): Promise<any> {
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
			case 'Program': {
				let lastEvaluatedInProgram: any;
				for (const statement of (node as AST.Program).body) {
					lastEvaluatedInProgram = await evaluate(statement, env, builtIns);
				}
				return lastEvaluatedInProgram;
			}
			case 'BlockStatement': {
				// 为块创建一个新的、独立的子作用域！
				const blockEnv = new Environment(env);
				let lastEvaluated: any = null; // 默认为 null (空碗)

				for (const stmt of (node as AST.BlockStatement).body) {
					lastEvaluated = await evaluate(stmt, blockEnv, builtIns);

					if (lastEvaluated instanceof ReturnValue || lastEvaluated === BREAK_SIGNAL) {
						return lastEvaluated;
					}
				}

				// 块的返回值是最后一个语句的返回值（如果它有的话）
				return env.resolveValue(lastEvaluated);
			}
			case 'SequenceExpression': {
				const seqExpr = node as AST.SequenceExpression;
				let accumulator = env.resolveValue(await evaluate(seqExpr.sections[0]!, env, builtIns));
				for (let i = 0; i < seqExpr.operators.length; i++) {
					const operator = seqExpr.operators[i]!.value;
					const rightHandSide = env.resolveValue(await evaluate(seqExpr.sections[i + 1]!, env, builtIns));
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
				const left = await evaluate(binExpr.left, env, builtIns);
				const right = await evaluate(binExpr.right, env, builtIns);

				const leftVal = env.resolveValue(left);
				const rightVal = env.resolveValue(right);

				const op = binExpr.operator;

				if (['-', '*', '/'].includes(op)) {
					if (typeof leftVal !== 'number' || typeof rightVal !== 'number') {
						throw new Error(`'${op}' 操作符只能用于两个 {${typeMap.number}} 之间喵!`);
					}
				}

				if (['+', '>', '<', '>=', '<='].includes(op)) {
					if (typeof leftVal !== typeof rightVal) {
						throw new Error(
							`'${op}' 操作符只能给同类用喵! ${getMeaoiuType(leftVal)} 和 ${getMeaoiuType(rightVal)} 不可以喵!`
						);
					}
					if (typeof leftVal !== 'number' && typeof leftVal !== 'string') {
						throw new Error(`'${op}' 操作符只能用于 {${typeMap.number}} 或 {${typeMap.string}} 之间喵!`);
					}
				}
				switch (op) {
					case '+':
						return leftVal + rightVal;
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
				const leftVal = env.resolveValue(await evaluate(logExpr.left, env, builtIns));
				switch (logExpr.operator) {
					case 'AND':
						return leftVal && env.resolveValue(await evaluate(logExpr.right, env, builtIns));
					case 'OR':
						return leftVal || env.resolveValue(await evaluate(logExpr.right, env, builtIns));
					case 'NOR':
						return !(leftVal || env.resolveValue(await evaluate(logExpr.right, env, builtIns)));
					case 'NAND':
						return !(leftVal && env.resolveValue(await evaluate(logExpr.right, env, builtIns)));
				}
			}
			case 'VariableDeclaration': {
				const varDec = node as AST.VariableDeclaration;
				let value = (await evaluate(varDec.value, env, builtIns));
				if (value instanceof ReturnValue) value = value.value;
				return env.declare(varDec.identifier.symbol, value, varDec.kind);
			}
			case 'AssignmentStatement': {
				const assignStmt = node as AST.AssignmentStatement;
				let value = await evaluate(assignStmt.value, env, builtIns);
				if (value instanceof ReturnValue) value = value.value;
				return env.assign(assignStmt.assignee.symbol, value, assignStmt.kind);
			}
			case 'IfStatement': {
				const isTrue = env.resolveValue(await evaluate((node as AST.IfStatement).test, env, builtIns));
				if (isTrue) {
					return await evaluate((node as AST.IfStatement).consequent, env, builtIns);
				} else if ((node as AST.IfStatement).alternate) {
					return await evaluate((node as AST.IfStatement).alternate!, env, builtIns);
				}
				return null;
			}
			case 'LoopStatement': {
				while (true) {
					const result = await evaluate((node as AST.LoopStatement).body, env, builtIns);
					if (result === BREAK_SIGNAL) break;
					if (result instanceof ReturnValue) return result;
				}
				return null;
			}
			case 'BreakStatement':
				return BREAK_SIGNAL;
			case 'FunctionDeclaration': {
				const funcDec = node as AST.FunctionDeclaration;
				env.declareFunction(funcDec.name.symbol, funcDec);
				return;
			}
			case 'CallExpression': {
				const callExpr = node as AST.CallExpression;
				const funcName = callExpr.callee.symbol;

				if (isBuiltInFunctionName(funcName)) {
					const args = await Promise.all(callExpr.args.map(arg => evaluate(arg.expression, env, builtIns)));
					const evalArgs = args.map(arg => env.resolveValue(arg));
					return builtIns[funcName](evalArgs);
				}

				const func = env.lookupFunction(funcName);
				if (!func) throw new Error(`计谋? ${funcName}`);

				const functionEnv = new Environment(env);
				if (callExpr.args.length !== func.params.length) throw new Error(`贡品数量?`);

				for (let i = 0; i < func.params.length; i++) {
					const paramName = func.params[i]!.symbol;
					const argument = callExpr.args[i]!;

					if (argument.isClone || argument.expression.type !== 'Identifier') {
						// 如果是“高仿”
						const argValue = await evaluate(argument.expression, env, builtIns);
						functionEnv.declare(paramName, argValue, 'Copy');
					} else {
						// 默认是引用
						const varName = (argument.expression as AST.Identifier).symbol;
						const sourceScope = env.findVariableScope(varName);
						if (!sourceScope) throw new Error(`找不到要引用的变量「${varName}」喵！`);

						functionEnv.declareReference(paramName, sourceScope, varName);
					}
				}

				const result = await evaluate(func.body, functionEnv, builtIns);
				if (result instanceof ReturnValue) return result.value;
				if (result === BREAK_SIGNAL) {
					console.warn(`警告喵: 在${typeMap.function} '${funcName}' 中，说'累了'也要继续玩喵。`);
				}
				return null;
			}
			case 'ReturnStatement': {
				const returnStmt = node as AST.ReturnStatement;
				const value = returnStmt.argument ? await evaluate(returnStmt.argument, env, builtIns) : null;
				return new ReturnValue(env.resolveValue(value));
			}
			case 'ExpressionStatement':
				return await evaluate((node as AST.ExpressionStatement).expression, env, builtIns);
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
