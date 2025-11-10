// src/core/run/interpreter.ts

import type * as AST from '../ast.js';
import { AssignmentKind, LogicalOperator, NodeType } from '../ast.js';
import { type BuiltInFunctions, isBuiltInFunctionName } from '../builtIns.js';
import { MeaoiuError, errorFrom } from '../error.js';
import { checkArithmeticOperation, checkComparisonOperation, getMeaoiuType, MeaoiuType, typeNames } from '../typedef.js';
import { Environment } from './environment.js';
import logger from './logger.js';

const BREAK_SIGNAL = { type: 'BREAK_SIGNAL' } as const; // '累了~'
const CONTINUE_SIGNAL = { type: 'CONTINUE_SIGNAL' } as const; //'偷袭~'
class ReturnValue {
	constructor(public value: unknown) {}
} // '叼回来 [值]~'
class LoopValue {
	constructor(public value: unknown) {}
} // '偷袭 <值>~'

const ReturnOrAmbush: Record<
	(AST.ReturnStatement | AST.AmbushStatement)['type'],
	{ emptySignal: ReturnValue | typeof CONTINUE_SIGNAL; valueHandler: (value: unknown) => unknown }
> = {
	[NodeType.ReturnStatement]: {
		emptySignal: new ReturnValue(null),
		valueHandler: value => new ReturnValue(value),
	},
	[NodeType.AmbushStatement]: {
		emptySignal: CONTINUE_SIGNAL,
		valueHandler: value => new LoopValue(value),
	},
};

type BoundaryEnv = Partial<Record<(AST.ReturnStatement | AST.AmbushStatement)['type'], Environment>>;
const enum NewEnvType {
	normal,
	func,
	loop,
}

export async function evaluate(
	node: AST.Node,
	env: Environment,
	builtIns: BuiltInFunctions,
	boundaryEnv: BoundaryEnv,
	newEnvType: NewEnvType = NewEnvType.normal
): Promise<any> {
	try {
		switch (node.type) {
			case NodeType.NumericLiteral:
			case NodeType.StringLiteral:
			case NodeType.BooleanLiteral:
				return node.value;
			case NodeType.NullLiteral:
				return null;
			case NodeType.Identifier:
				return env.lookup(node.symbol);
			case NodeType.Program: {
				let lastEvaluatedInProgram: any;
				for (const statement of node.body) {
					lastEvaluatedInProgram = await evaluate(statement, env, builtIns, boundaryEnv);
				}
				return lastEvaluatedInProgram;
			}
			case NodeType.BlockStatement: {
				const { isCollection, body } = node;
				const blockEnv = newEnvType !== NewEnvType.normal ? env : new Environment(env);
				let lastEvaluated = null;
				let autoIndexCounter = 0; // 自动索引计数器

				for (const stmt of body) {
					if (isCollection) {
						// --- 纸箱的特殊求值规则 ---
						if (stmt.type === NodeType.VariableDeclaration) {
							// 处理带 `蹭` 或隐式的 `a 就是 1`
							await evaluate(stmt, blockEnv, builtIns, boundaryEnv);
						} else if (stmt.type === NodeType.ExpressionStatement) {
							// 处理纯表达式，调用辅助函数
							autoIndexCounter = await _evaluateCollectionElement(
								stmt,
								blockEnv,
								autoIndexCounter,
								evaluate, // 传入 evaluate 自身用于递归
								builtIns,
								boundaryEnv
							);
						}
					} else {
						// --- 普通 [##] 块的逻辑 ---
						lastEvaluated = await evaluate(stmt, blockEnv, builtIns, boundaryEnv);
						if (
							lastEvaluated instanceof ReturnValue ||
							lastEvaluated === BREAK_SIGNAL ||
							lastEvaluated instanceof LoopValue ||
							lastEvaluated === CONTINUE_SIGNAL
						) {
							return lastEvaluated;
						}
					}
				}

				if (isCollection) return blockEnv; // 返回纸箱的环境
				if (newEnvType !== NewEnvType.normal) return null; // 非普通块只靠信号返回

				if (lastEvaluated?.isVariableReference) {
					const varRef = lastEvaluated;
					const sourceScope: Environment = varRef.scope;

					if (sourceScope === blockEnv) {
						const lastStmtNode = body.at(-1) ?? node;
						throw errorFrom(lastStmtNode, `运行错误喵: 不能让里面玩具「${varRef.name}」跑出去喵！`);
					}
				}

				return lastEvaluated;
			}
			case NodeType.MemberAccessExpression: {
				const memberExpr = node;

				const collectionRef = await evaluate(memberExpr.object, env, builtIns, boundaryEnv);
				const collection = env.resolveValue(collectionRef);

				if (!(collection instanceof Environment)) {
					throw errorFrom(
						memberExpr.object,
						`运行错误喵: 用 '@' 只能从${typeNames[MeaoiuType.COLLECTION]}里拿东西喵！`
					);
				}

				const property = await evaluate(memberExpr.property, env, builtIns, boundaryEnv);
				const propValue = env.resolveValue(property);

				if (typeof propValue !== 'number' && typeof propValue !== 'string') {
					throw errorFrom(
						memberExpr.property,
						`运行错误喵: ${typeNames[MeaoiuType.COLLECTION]}的索引必须是${typeNames[MeaoiuType.NUMBER]}或${
							typeNames[MeaoiuType.STRING]
						}喵！`
					);
				}

				return collection.lookup(propValue);
			}
			case NodeType.SequenceExpression: {
				const { sections, operators } = node;
				let accVal = env.resolveValue(await evaluate(sections[0]!, env, builtIns, boundaryEnv));

				for (let i = 0; i < operators.length; i++) {
					const opToken = operators[i]!,
						op = opToken.value;
					const nextVal = env.resolveValue(await evaluate(sections[i + 1]!, env, builtIns, boundaryEnv));

					switch (op) {
						case '==':
							accVal = accVal === nextVal;
							continue; // 计算完毕，继续下一次循环
						case '!=':
							accVal = accVal !== nextVal;
							continue; // 计算完毕，继续下一次循环
					}

					const accType = getMeaoiuType(accVal);
					const nextType = getMeaoiuType(nextVal);

					const error = checkArithmeticOperation(op, accType, nextType);
					if (error) throw errorFrom(opToken, `运行错误喵: ${error}`);

					switch (op) {
						case '+':
							accVal += nextVal;
							break;
						case '-':
							accVal -= nextVal;
							break;
						case '*':
							accVal *= nextVal;
							break;
						case '/':
							accVal /= nextVal;
							break;
						default:
							throw errorFrom(opToken, `运行错误喵: 这是什么节喵: ${op}`);
					}
				}
				return accVal;
			}
			case NodeType.ArithmeticExpression: {
				const { operator: op, left, right } = node;

				const leftVal = env.resolveValue(await evaluate(left, env, builtIns, boundaryEnv));
				const rightVal = env.resolveValue(await evaluate(right, env, builtIns, boundaryEnv));

				const leftType = getMeaoiuType(leftVal);
				const rightType = getMeaoiuType(rightVal);

				const error = checkArithmeticOperation(op, leftType, rightType);
				if (error) throw errorFrom(node, `运行错误喵: ${error}`);

				switch (op) {
					case '+':
						return leftType === MeaoiuType.COLLECTION ? leftVal.createMergedView(rightVal) : leftVal + rightVal;
					case '-':
						return leftVal - rightVal;
					case '*':
						return leftVal * rightVal;
					case '/':
						return leftVal / rightVal;
				}
				throw errorFrom(node, `运行错误喵: 是两块钱的运算符喵? ${op}`);
			}
			case NodeType.ComparisonExpression: {
				const { expressions, operators } = node;
				if (expressions.length < 2) {
					return env.resolveValue(await evaluate(expressions[0]!, env, builtIns, boundaryEnv));
				}

				let overallResult = true;
				let currentLeftVal = env.resolveValue(await evaluate(expressions[0]!, env, builtIns, boundaryEnv));

				for (let i = 0; i < operators.length; i++) {
					const opToken = operators[i]!,
						op = opToken.value;
					const currentRightVal = env.resolveValue(await evaluate(expressions[i + 1]!, env, builtIns, boundaryEnv));

					const leftType = getMeaoiuType(currentLeftVal);
					const rightType = getMeaoiuType(currentRightVal);

					const error = checkComparisonOperation(op, leftType, rightType);
					if (error) throw errorFrom(opToken, `运行错误喵: ${error}`);

					// --- 执行单个比较 ---
					let currentResult = false;
					switch (op) {
						case '==':
							currentResult = currentLeftVal === currentRightVal;
							break;
						case '!=':
							currentResult = currentLeftVal !== currentRightVal;
							break;
						case '>':
							currentResult = currentLeftVal > currentRightVal;
							break;
						case '<':
							currentResult = currentLeftVal < currentRightVal;
							break;
						case '>=':
							currentResult = currentLeftVal >= currentRightVal;
							break;
						case '<=':
							currentResult = currentLeftVal <= currentRightVal;
							break;
						default:
							throw errorFrom(opToken, `运行错误喵: 这个不会比喵: ${op}`);
					}

					if (!currentResult) {
						overallResult = false;
						break; // 短路！
					}

					// 右侧成为下一次比较的左侧
					currentLeftVal = currentRightVal;
				}
				return overallResult;
			}
			case NodeType.LogicalExpression: {
				const { operator: op, left, right } = node;
				const leftVal = env.resolveValue(await evaluate(left, env, builtIns, boundaryEnv));
				switch (op) {
					case LogicalOperator.AND:
						return leftVal && env.resolveValue(await evaluate(right, env, builtIns, boundaryEnv));
					case LogicalOperator.OR:
						return leftVal || env.resolveValue(await evaluate(right, env, builtIns, boundaryEnv));
					case LogicalOperator.NOR:
						return !(leftVal || env.resolveValue(await evaluate(right, env, builtIns, boundaryEnv)));
					case LogicalOperator.NAND:
						return !(leftVal && env.resolveValue(await evaluate(right, env, builtIns, boundaryEnv)));
				}
			}
			case NodeType.VariableDeclaration: {
				const { identifier, initialization } = node;
				env.declare(identifier.symbol); // 声明变量名
				// 若有初始化部分，则执行以赋值
				if (initialization) return await evaluate(initialization, env, builtIns, boundaryEnv);
				return null;
			}
			case NodeType.AssignmentStatement: {
				const assignStmt = node;

				let value = await evaluate(assignStmt.value, env, builtIns, boundaryEnv);
				if (value instanceof ReturnValue) value = value.value;

				if (assignStmt.assignee.type === NodeType.MemberAccessExpression) {
					// 目标是 a@b 这种形式
					const memberExpr = assignStmt.assignee;

					// 找到纸箱
					const collectionRef = await evaluate(memberExpr.object, env, builtIns, boundaryEnv);
					const collection = env.resolveValue(collectionRef);
					if (!(collection instanceof Environment)) {
						throw errorFrom(
							memberExpr.object,
							`运行错误喵: 只能给${typeNames[MeaoiuType.COLLECTION]}的成员赋值喵！`
						);
					}

					// 找到索引/键
					const propValue = env.resolveValue(await evaluate(memberExpr.property, env, builtIns, boundaryEnv));
					let key: string;
					switch (typeof propValue) {
						case 'string': // 索引是字符串，直接用
							key = propValue;
							break;
						case 'number': // 索引是数字
							// 数字索引超出范围，转为字符串键
							if (propValue < 1 || propValue > collection.orderedVariableNames.length) key = String(propValue);
							// 索引存在，用它在有序列表里的名字
							else key = collection.orderedVariableNames[propValue - 1]!;
							break;
						default:
							throw errorFrom(
								memberExpr.property,
								`运行错误喵: ${typeNames[MeaoiuType.COLLECTION]}的索引必须是${typeNames[MeaoiuType.NUMBER]}或${
									typeNames[MeaoiuType.STRING]
								}喵！`
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
				const target = await evaluate(assignStmt.assignee, env, builtIns, boundaryEnv);
				if (!target?.isVariableReference) {
					throw errorFrom(assignStmt.assignee, `运行错误喵: 赋值的左边必须是一个碗喵！`);
				}
				return target.scope.assign(target.name, value, assignStmt.kind);
			}
			case NodeType.IfStatement: {
				const isTrue = env.resolveValue(await evaluate(node.test, env, builtIns, boundaryEnv));
				if (isTrue) return await evaluate(node.consequent, env, builtIns, boundaryEnv);
				else if (node.alternate) return await evaluate(node.alternate, env, builtIns, boundaryEnv);
				return null;
			}
			case NodeType.LoopStatement: {
				while (true) {
					const loopEnv = new Environment(env);
					const result = await evaluate(
						node.body,
						loopEnv,
						builtIns,
						{ ...boundaryEnv, [NodeType.AmbushStatement]: loopEnv },
						NewEnvType.loop
					);

					if (result === BREAK_SIGNAL) break; // '累了~' -> 退出循环
					if (result === CONTINUE_SIGNAL) continue; // '偷袭~' -> 继续下次循环
					if (result instanceof LoopValue) return result.value; // '偷袭 <值>~' -> 退出并返回值
					if (result instanceof ReturnValue) return result; // '叼回来 [值]~' -> 退出函数
					// break; // 让循环变懒
				}
				return null; // '累了' 退出后，循环表达式返回“空碗”
			}
			case NodeType.BreakStatement:
				return BREAK_SIGNAL;
			case NodeType.AmbushStatement:
			case NodeType.ReturnStatement: {
				if (!node.argument) return ReturnOrAmbush[node.type].emptySignal;

				const value = await evaluate(node.argument, env, builtIns, boundaryEnv);

				if (node.argument.type === NodeType.Identifier) {
					const varName = node.argument.symbol;
					const varRef = env.lookup(varName);
					const sourceScope = varRef.scope;

					if (sourceScope.isInsideOf(boundaryEnv[node.type])) {
						throw errorFrom(
							node.argument,
							`运行错误喵: 不能把里面的临时玩具「${varName}」带走喵，它离开这里就消失了！`
						);
					}
				}

				return ReturnOrAmbush[node.type].valueHandler(value);
			}
			case NodeType.FunctionDeclaration: {
				env.declareFunction(node.name.symbol, node);
				return null;
			}
			case NodeType.CallExpression: {
				const callExpr = node;
				const funcName = callExpr.callee.symbol;

				const argsRef = await evaluate(callExpr.args, env, builtIns, boundaryEnv);
				const argsCollection = env.resolveValue(argsRef);
				if (!(argsCollection instanceof Environment)) throw errorFrom(callExpr.args, `运行错误喵: 贡品要装好喵！`);

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
				if (!func) {
					throw errorFrom(
						callExpr.callee,
						`运行错误喵: 没有叫「${funcName}」的${typeNames[MeaoiuType.FUNCTION]}喵！`
					);
				}

				const functionEnv = new Environment(env);

				// 从函数定义的参数块中，按顺序提取出参数的名字
				const paramNames = func.params.body
					.map(stmt => {
						if (stmt.type === NodeType.ExpressionStatement && stmt.expression.type === NodeType.Identifier) {
							return stmt.expression.symbol;
						}
						if (stmt.type === NodeType.VariableDeclaration) return stmt.identifier.symbol;
						throw errorFrom(stmt, `运行错误喵: 贡品不能是奇怪的样子 ${stmt.type} 喵！`);
					})
					.filter(Boolean);

				if (argsCollection.orderedVariableNames.length < paramNames.length) {
					throw errorFrom(
						callExpr.args,
						`运行错误喵: 要 ${paramNames.length} 个贡品，只给 ${argsCollection.orderedVariableNames.length} 个不够喵！`
					);
				}

				// 按顺序将参数纸箱里的变量“嫁接”到函数内部作用域
				for (let i = 0; i < paramNames.length; i++) {
					const paramName = paramNames[i]!;
					const argVarName = argsCollection.orderedVariableNames[i]!;
					// 创建从“函数参数名”到“调用纸箱中变量”的引用
					functionEnv.declareReference(paramName, argsCollection, argVarName);
				}

				const result = await evaluate(
					func.body,
					functionEnv,
					builtIns,
					{ ...boundaryEnv, [NodeType.ReturnStatement]: functionEnv },
					NewEnvType.func
				);
				if (result instanceof ReturnValue) return result.value;
				if (result === BREAK_SIGNAL) {
					console.warn(`警告喵: 在${typeNames[MeaoiuType.FUNCTION]} '${funcName}' 中，说'累了'也要继续玩喵。`);
				}
				return null;
			}
			case NodeType.UnaryExpression: {
				const { operator: op, argument } = node;
				const argumentRef = await evaluate(argument, env, builtIns, boundaryEnv);
				const argumentValue = env.resolveValue(argumentRef);

				if (op === AssignmentKind.COPY) {
					// 高仿
					if (argumentValue instanceof Environment) return argumentValue.createShallowCopy();
					return argumentValue;
				}

				if (op === AssignmentKind.MOVE) {
					// 抢走
					if (!argumentRef?.isVariableReference) {
						throw errorFrom(argument, `运行错误喵: 只能抢走一个变量，不能抢走一个表达式结果喵！`);
					}
					// 标记源头为已移动
					argumentRef.scope.variables.get(argumentRef.name).moved = true;
					return argumentValue;
				}
				return null;
			}
			case NodeType.ExpressionStatement:
				return await evaluate(node.expression, env, builtIns, boundaryEnv);
			case NodeType.ErrorNode:
				throw new MeaoiuError(node);
			default: // 此处已推断为不可达
				const n: never = node;
				throw errorFrom(n, `运行错误喵: 不支持的节点类型喵！${n}`);
		}
	} catch (err) {
		if (err instanceof MeaoiuError) throw err;
		const errorMessage = err instanceof Error ? err.message : String(err);
		throw errorFrom(node, `运行错误喵: ${errorMessage}`); // 附加上当前 AST 节点再抛出
	}
}

// ----------------------------------------------------------------
// 辅助函数：专门用于处理纸箱 [= ... =] 中的匿名元素（表达式）
// ----------------------------------------------------------------
async function _evaluateCollectionElement(
	stmt: AST.ExpressionStatement,
	blockEnv: Environment,
	autoIndexCounter: number,
	evaluateFn: typeof evaluate,
	builtIns: BuiltInFunctions,
	boundaryEnv: BoundaryEnv
): Promise<number> {
	const expr = stmt.expression;

	let name: string | null = null;
	let kind: AssignmentKind = AssignmentKind.COPY;
	let valueToAssign: any;

	if (expr.type === NodeType.Identifier) {
		// 元素是 `a` -> 声明为 `a`，并创建引用
		name = expr.symbol;
		kind = AssignmentKind.REFERENCE;
		valueToAssign = await evaluateFn(expr, blockEnv, builtIns, boundaryEnv);
	} else if (expr.type === NodeType.UnaryExpression) {
		// 元素是 `高仿 a` 或 `抢走 a`
		valueToAssign = await evaluateFn(expr, blockEnv, builtIns, boundaryEnv); // 得到最终的值
		kind = AssignmentKind.COPY;
		if (expr.argument.type === NodeType.Identifier) name = expr.argument.symbol;
	} else {
		// 元素是字面量（'毛线球'）或嵌套纸箱（[=...=]）
		valueToAssign = await evaluateFn(expr, blockEnv, builtIns, boundaryEnv);
		kind = AssignmentKind.COPY;
	}

	// 如果没有显式名字，就自动生成一个防碰撞的名字
	if (!name) {
		// 使用反花括号，确保用户无法在语法上写出这个名字
		name = `}auto_${autoIndexCounter}{`;
		autoIndexCounter++; // 索引自增
	}

	if (blockEnv.variables.has(name)) {
		throw errorFrom(stmt, `运行错误喵: ${typeNames[MeaoiuType.COLLECTION]}里已经有一个叫做「${name}」的玩具了喵！`);
	}

	// 将这个元素“声明”到纸箱的环境中
	blockEnv.declare(name); // 这会将 name 添加到 orderedVariableNames
	blockEnv.assign(name, valueToAssign, kind);

	return autoIndexCounter;
}
