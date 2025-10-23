// src/core/run/interpreter.ts

import type * as AST from '../ast.js';
import { Environment } from './environment.js';
import { type BuiltInFunctions, isBuiltInFunctionName } from '../builtIns.js';
import { getMeaoiuType, typeMap } from '../typedef.js';
import logger from './logger.js';

const BREAK_SIGNAL = { type: 'BREAK_SIGNAL' };
class ReturnValue {
	constructor(public value: any) {}
}

export async function evaluate(node: AST.Node, env: Environment, builtIns: BuiltInFunctions): Promise<any> {
	try {
		switch (node.type) {
			case 'NumericLiteral':
			case 'StringLiteral':
			case 'BooleanLiteral':
				return node.value;
			case 'NullLiteral':
				return null;
			case 'Identifier':
				return env.lookup(node.symbol);
			case 'Program': {
				let lastEvaluatedInProgram: any;
				for (const statement of node.body) {
					lastEvaluatedInProgram = await evaluate(statement, env, builtIns);
				}
				return lastEvaluatedInProgram;
			}
			case 'BlockStatement': {
				const block = node;
				const blockEnv = new Environment(env);
				let lastEvaluated: any = null;
				let autoIndexCounter = 0; // 自动索引计数器

				for (const stmt of block.body) {
					if (block.isCollection) {
						// --- 集合的特殊求值规则 ---
						if (stmt.type === 'VariableDeclaration') {
							// 处理带 `蹭` 或隐式的 `a 就是 1`
							await evaluate(stmt, blockEnv, builtIns);
						} else if (stmt.type === 'ExpressionStatement') {
							// 处理纯表达式，调用辅助函数
							autoIndexCounter = await _evaluateCollectionElement(
								stmt,
								blockEnv,
								autoIndexCounter,
								evaluate, // 传入 evaluate 自身用于递归
								builtIns
							);
						}
					} else {
						// --- 普通 [##] 块的逻辑 ---
						lastEvaluated = await evaluate(stmt, blockEnv, builtIns);
						if (lastEvaluated instanceof ReturnValue || lastEvaluated === BREAK_SIGNAL) return lastEvaluated;
					}
				}

				if (block.isCollection) return blockEnv; // 返回集合的环境

				return env.resolveValue(lastEvaluated);
			}
			case 'MemberAccessExpression': {
				const memberExpr = node;

				const collectionRef = await evaluate(memberExpr.object, env, builtIns);
				const collection = env.resolveValue(collectionRef);

				if (!(collection instanceof Environment)) {
					throw new Error(
						`[${memberExpr.object.line}:${memberExpr.object.col}] 运行时错误喵: 只能用 '@' 从集合里拿东西喵！`
					);
				}

				const property = await evaluate(memberExpr.property, env, builtIns);
				const propValue = env.resolveValue(property);

				if (typeof propValue !== 'number' && typeof propValue !== 'string') {
					throw new Error(
						`[${memberExpr.property.line}:${memberExpr.property.col}] 运行时错误喵: 集合的索引必须是摸数或闲话喵！`
					);
				}

				return collection.lookup(propValue);
			}
			case 'SequenceExpression': {
				const seqExpr = node;
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
				const binExpr = node;
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
				const logExpr = node;
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
				const varDec = node;
				env.declare(varDec.identifier.symbol); // 声明变量名
				// 若有初始化部分，则执行以赋值
				if (varDec.initialization) return await evaluate(varDec.initialization, env, builtIns);
				return null;
			}
			case 'AssignmentStatement': {
				const assignStmt = node;

				let value = await evaluate(assignStmt.value, env, builtIns);
				if (value instanceof ReturnValue) value = value.value;

				if (assignStmt.assignee.type === 'MemberAccessExpression') {
					// 目标是 a@b 这种形式
					const memberExpr = assignStmt.assignee;

					// 找到集合
					const collectionRef = await evaluate(memberExpr.object, env, builtIns);
					const collection = env.resolveValue(collectionRef);
					if (!(collection instanceof Environment)) {
						throw new Error(
							`[${memberExpr.object.line}:${memberExpr.object.col}] 运行时错误喵: 只能给集合的成员赋值喵！`
						);
					}

					// 找到索引/键
					const propValue = env.resolveValue(await evaluate(memberExpr.property, env, builtIns));
					let key: string;
					if (typeof propValue === 'number') {
						// 数字索引超出范围，转为字符串键
						if (propValue < 1 || propValue > collection.orderedVariableNames.length) key = String(propValue);
						// 索引存在，用它在有序列表里的名字
						else key = collection.orderedVariableNames[propValue - 1]!;
					} else if (typeof propValue === 'string') {
						// 索引是字符串，直接用
						key = propValue;
					} else {
						throw new Error(
							`[${memberExpr.property.line}:${memberExpr.property.col}] 运行时错误喵: 集合的索引必须是摸数或闲话喵！`
						);
					}

					// 检查是“赋值”还是“扩充”
					if (!collection.variables.has(key)) {
						logger.debug(`[ENV #${collection.id}] EXPAND: '${key}'`);
						collection.declare(key); // 声明新键
					}

					return collection.assign(key, value, assignStmt.kind);
				}
				// 目标是 a 这种普通变量
				const target = await evaluate(assignStmt.assignee, env, builtIns);
				if (!target?.isVariableReference) {
					throw new Error(
						`[${node.line}:${node.col}] 运行时错误喵: 赋值的左边必须是一个变量，或者能返回“位置”的计谋喵！`
					);
				}
				return target.scope.assign(target.name, value, assignStmt.kind);
			}
			case 'IfStatement': {
				const isTrue = env.resolveValue(await evaluate(node.test, env, builtIns));
				if (isTrue) {
					return await evaluate(node.consequent, env, builtIns);
				} else if (node.alternate) {
					return await evaluate(node.alternate, env, builtIns);
				}
				return null;
			}
			case 'LoopStatement': {
				while (true) {
					const result = await evaluate(node.body, env, builtIns);
					if (result === BREAK_SIGNAL) break;
					if (result instanceof ReturnValue) return result;
				}
				return null;
			}
			case 'BreakStatement':
				return BREAK_SIGNAL;
			case 'FunctionDeclaration': {
				const funcDec = node;
				env.declareFunction(funcDec.name.symbol, funcDec);
				return;
			}
			case 'CallExpression': {
				const callExpr = node;
				const funcName = callExpr.callee.symbol;

				const argsRef = await evaluate(callExpr.args, env, builtIns);
				const argsCollection = env.resolveValue(argsRef);
				if (!(argsCollection instanceof Environment)) {
					throw new Error(
						`[${callExpr.args.line}:${callExpr.args.col}] 运行时错误喵: 扒计谋时，第一个参数必须是一个集合喵！`
					);
				}

				if (isBuiltInFunctionName(funcName)) {
					const evalArgs = [];
					for (const varName of argsCollection.orderedVariableNames) {
						const argRef = argsCollection.lookup(varName);
						const argVal = argsCollection.resolveValue(argRef);
						evalArgs.push(argVal);
					}
					return builtIns[funcName](evalArgs);
				}

				const func = env.lookupFunction(funcName);
				if (!func) throw new Error(`计谋? ${funcName}`);

				const functionEnv = new Environment(env);

				// 从函数定义的参数块中，按顺序提取出参数的名字
				const paramNames = func.params.body
					.map(stmt => {
						if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'Identifier') {
							return stmt.expression.symbol;
						}
						if (stmt.type === 'VariableDeclaration') return stmt.identifier.symbol;
						return null;
					})
					.filter(Boolean) as string[];

				if (argsCollection.orderedVariableNames.length < paramNames.length) {
					throw new Error(
						`只给 ${argsCollection.orderedVariableNames.length} 个贡品不够喵！需要 ${paramNames.length} 个才能施展计谋 '${funcName}'。`
					);
				}

				// 按顺序将参数集合里的变量“嫁接”到函数内部作用域
				for (let i = 0; i < paramNames.length; i++) {
					const paramName = paramNames[i]!;
					const argVarName = argsCollection.orderedVariableNames[i]!;
					// 创建从“函数参数名”到“调用集合中变量”的引用
					functionEnv.declareReference(paramName, argsCollection, argVarName);
				}

				const result = await evaluate(func.body, functionEnv, builtIns);
				if (result instanceof ReturnValue) return result.value;
				if (result === BREAK_SIGNAL) console.warn(`警告喵: 在计谋 '${funcName}' 中，说'累了'也要继续玩喵。`);
				return null;
			}
			case 'ReturnStatement': {
				const returnStmt = node;
				if (!returnStmt.argument) return new ReturnValue(null); // 叼回来~ -> 返回空碗

				const value = await evaluate(returnStmt.argument, env, builtIns);

				if (returnStmt.argument.type === 'Identifier') {
					const varName = returnStmt.argument.symbol;
					const variableScope = env.findVariableScope(varName);

					if (variableScope === env) {
						throw new Error(
							`[${node.line}:${node.col}] 运行时错误喵: 不能把计谋里的临时玩具「${varName}」叼出去喵，它离开这里就消失了！`
						);
					}
				}
				return new ReturnValue(value);
			}
			case 'UnaryExpression': {
				const unaryExpr = node;
				const argumentRef = await evaluate(unaryExpr.argument, env, builtIns);
				const argumentValue = env.resolveValue(argumentRef);

				if (unaryExpr.operator === 'Copy') {
					// 高仿
					if (argumentValue instanceof Environment) return argumentValue.createShallowCopy();
					return argumentValue;
				}

				if (unaryExpr.operator === 'Move') {
					// 抢走
					if (!argumentRef?.isVariableReference) {
						throw new Error(
							`[${node.line}:${node.col}] 运行时错误喵: 只能“抢走”一个变量，不能抢走一个表达式结果喵！`
						);
					}
					// 标记源头为已移动
					argumentRef.scope.variables.get(argumentRef.name).moved = true;
					return argumentValue;
				}
				return null;
			}
			case 'ExpressionStatement':
				return await evaluate(node.expression, env, builtIns);
		}
	} catch (err: any) {
		if (err.message.startsWith('[')) throw err; // 如果错误已经有位置信息，直接抛出
		// 否则，附加上当前 AST 节点的位置信息再抛出
		throw new Error(`[${node.line}:${node.col}] 运行时错误喵: ${err.message}`);
	}
}

// ----------------------------------------------------------------
// 辅助函数：专门用于处理集合 [= ... =] 中的匿名元素（表达式）
// ----------------------------------------------------------------
async function _evaluateCollectionElement(
	stmt: AST.ExpressionStatement,
	blockEnv: Environment,
	autoIndexCounter: number,
	evaluateFn: (node: AST.Node, env: Environment, builtIns: BuiltInFunctions) => Promise<any>,
	builtIns: BuiltInFunctions
): Promise<number> {
	const expr = stmt.expression;

	let name: string | null = null;
	let kind: AST.AssignmentKind = 'Copy';
	let valueToAssign: any;

	if (expr.type === 'Identifier') {
		// 元素是 `a` -> 声明为 `a`，并创建引用
		name = expr.symbol;
		kind = 'Reference';
		valueToAssign = await evaluateFn(expr, blockEnv, builtIns); // 得到 VariableReference
	} else if (expr.type === 'UnaryExpression') {
		// 元素是 `高仿 a` 或 `抢走 a`
		valueToAssign = await evaluateFn(expr, blockEnv, builtIns); // 得到最终的值
		kind = 'Copy'; // 值已经是 C/M 过的，我们直接“复制”进集合
		if (expr.argument.type === 'Identifier') {
			name = expr.argument.symbol; // 名字就是 `a`
		}
	} else {
		// 元素是字面量（'毛线球'）或嵌套集合（[=...=]）
		valueToAssign = await evaluateFn(expr, blockEnv, builtIns);
		kind = 'Copy';
		// 名字保持 null，下面会自动生成
	}

	// 如果没有显式名字，就自动生成一个防碰撞的名字
	if (!name) {
		// 使用反花括号，确保用户无法在语法上写出这个名字
		name = `}auto_${autoIndexCounter}{`;
		autoIndexCounter++; // 索引自增
	}

	if (blockEnv.variables.has(name)) {
		throw new Error(`[${stmt.line}:${stmt.col}] 运行时错误喵: 集合里已经有一个叫做「${name}」的玩具了喵！`);
	}

	// 将这个元素“声明”到集合的环境中
	blockEnv.declare(name); // 这会将 name 添加到 orderedVariableNames
	blockEnv.assign(name, valueToAssign, kind);

	return autoIndexCounter;
}
