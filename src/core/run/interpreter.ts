// src/core/run/interpreter.ts

import type * as AST from '../ast.js';
import { AssignmentKind, LogicalOperator, NodeType } from '../ast.js';
import { checkArgsForBuiltIn, isBuiltInFunctionName, type MeaoiuBuiltIns } from '../builtIns.js';
import { errorFrom, MeaoiuError } from '../error.js';
import {
	checkArithmeticOperation,
	checkComparisonOperation,
	getMeaoiuType,
	MeaoiuType,
	type MeaoiuValue,
	typeNames,
} from '../typedef.js';
import { autoKey, Environment } from './environment.js';
import logger from './logger.js';
import { BREAK_SIGNAL, CONTINUE_SIGNAL, type Evaluated, isReferenceLink, isSignal, LoopValue, ReturnValue } from './value.js';

type BoundaryEnv = Partial<Record<(AST.ReturnStatement | AST.AmbushStatement)['type'], Environment>>;
const enum NewEnvType {
	NORMAL,
	FUNC,
	LOOP,
}

const ReturnOrAmbush = {
	[NodeType.ReturnStatement]: {
		emptySignal: new ReturnValue(null),
		signalWith: value => new ReturnValue(value),
	},
	[NodeType.AmbushStatement]: {
		emptySignal: CONTINUE_SIGNAL,
		signalWith: value => new LoopValue(value),
	},
} as const satisfies Record<
	keyof BoundaryEnv,
	{ emptySignal: ReturnValue | typeof CONTINUE_SIGNAL; signalWith: (value: Evaluated) => ReturnValue | LoopValue }
>;

const resolveValue = Environment.resolveValue;

export async function evaluate(
	node: AST.Node,
	env: Environment,
	builtIns: MeaoiuBuiltIns,
	boundaryEnv: BoundaryEnv,
	newEnvType: NewEnvType = NewEnvType.NORMAL
): Promise<Evaluated> {
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
				let lastEvaluatedInProgram: Evaluated = null;
				for (const statement of node.body) {
					lastEvaluatedInProgram = await evaluate(statement, env, builtIns, boundaryEnv);
				}
				return lastEvaluatedInProgram;
			}
			case NodeType.BlockExpression: {
				const { isCollection, body } = node;
				const blockEnv = newEnvType !== NewEnvType.NORMAL ? env : new Environment(env);

				// --- 纸箱的特殊求值规则 ---
				if (isCollection) {
					let autoIndexCounter = 0; // 自动索引计数器
					for (const stmt of body) {
						// 声明语句
						if (stmt.type === NodeType.VariableDeclaration) await evaluate(stmt, blockEnv, builtIns, boundaryEnv);
						// 调用辅助函数处理纯表达式
						else if (stmt.type === NodeType.ExpressionStatement) {
							autoIndexCounter = await _evaluateCollectionElement(
								stmt,
								blockEnv,
								builtIns,
								boundaryEnv,
								autoIndexCounter
							);
						}
					}
					return blockEnv; // 返回纸箱的环境
				}

				// --- 普通 [##] 块的逻辑 ---
				let lastEvaluated: Evaluated = null;
				for (const stmt of body) {
					lastEvaluated = await evaluate(stmt, blockEnv, builtIns, boundaryEnv);
					if (isSignal(lastEvaluated)) return lastEvaluated;
				}

				if (newEnvType !== NewEnvType.NORMAL) return null; // 非普通环境只靠信号返回

				if (isReferenceLink(lastEvaluated) && lastEvaluated.scope === blockEnv) {
					const lastStmtNode = body.at(-1) ?? node;
					throw errorFrom(lastStmtNode, `运行错误喵: 不能让里面玩具「${lastEvaluated.name}」跑出去喵！`);
				}

				return lastEvaluated;
			}
			case NodeType.MemberAccessExpression: {
				const { object: objectNode, property: propertyNode } = node;
				const collection = resolveValue(await evaluate(objectNode, env, builtIns, boundaryEnv));

				if (!(collection instanceof Environment)) {
					throw errorFrom(objectNode, `运行错误喵: 从${typeNames[MeaoiuType.COLLECTION]}里拿东西才能用「@」喵！`);
				}

				const name = await _evaluateMemberName(propertyNode, env, builtIns, boundaryEnv, collection, index => {
					throw errorFrom(propertyNode, `运行错误喵: 喵呜！找不到「${index}」号玩具喵！`);
				});

				return collection.lookup(name);
			}
			case NodeType.SequenceExpression: {
				const { sections, operators } = node;
				// 动态检查，可以 AnyScript 喵
				let accVal: any = resolveValue(await evaluate(sections[0]!, env, builtIns, boundaryEnv));

				for (let i = 0; i < operators.length; i++) {
					const opToken = operators[i]!,
						op = opToken.value;
					const nextVal: any = resolveValue(await evaluate(sections[i + 1]!, env, builtIns, boundaryEnv));

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
							if (accType === MeaoiuType.COLLECTION) accVal = accVal.createMergedView(nextVal);
							else accVal += nextVal;
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
							throw errorFrom(opToken, `运行错误喵: 这个「${op}」这是什么节喵？`);
					}
				}
				return accVal;
			}
			case NodeType.ArithmeticExpression: {
				const { operator: op, left, right } = node;

				const leftVal: any = resolveValue(await evaluate(left, env, builtIns, boundaryEnv));
				const rightVal: any = resolveValue(await evaluate(right, env, builtIns, boundaryEnv));

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
				throw errorFrom(node, `运行错误喵: 「${op}」是两块钱的运算符喵?`);
			}
			case NodeType.ComparisonExpression: {
				const { expressions, operators } = node;

				let overallResult = true;
				let currentLeftVal: any = resolveValue(await evaluate(expressions[0]!, env, builtIns, boundaryEnv));

				for (let i = 0; i < operators.length; i++) {
					const opToken = operators[i]!,
						op = opToken.value;
					const currentRightVal: any = resolveValue(await evaluate(expressions[i + 1]!, env, builtIns, boundaryEnv));

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
							throw errorFrom(opToken, `运行错误喵: 不会用「${op}」比喵~`);
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
				const leftVal = resolveValue(await evaluate(left, env, builtIns, boundaryEnv));
				switch (op) {
					case LogicalOperator.AND:
						return !!(leftVal && resolveValue(await evaluate(right, env, builtIns, boundaryEnv)));
					case LogicalOperator.OR:
						return !!(leftVal || resolveValue(await evaluate(right, env, builtIns, boundaryEnv)));
					case LogicalOperator.NOR:
						return !(leftVal || resolveValue(await evaluate(right, env, builtIns, boundaryEnv)));
					case LogicalOperator.NAND:
						return !(leftVal && resolveValue(await evaluate(right, env, builtIns, boundaryEnv)));
					default: // 理论不可达
						const _o: never = op;
						throw errorFrom(node, `世界崩坏喵: 你发现了「${_o}」悖论喵~`);
				}
			}
			case NodeType.VariableDeclaration: {
				const { identifier, initialization } = node;
				const symbol = identifier.symbol;
				// 若有初始化部分，则执行以声明并赋值
				return initialization
					? _evaluateAssignment(initialization, env, builtIns, boundaryEnv, () => env.declare(symbol))
					: env.declare(symbol); // 声明变量名
			}
			case NodeType.AssignmentStatement:
				return _evaluateAssignment(node, env, builtIns, boundaryEnv);
			case NodeType.IfExpression: {
				const isTrue = resolveValue(await evaluate(node.condition, env, builtIns, boundaryEnv));
				if (isTrue) return evaluate(node.consequent, env, builtIns, boundaryEnv);
				else if (node.alternate) return evaluate(node.alternate, env, builtIns, boundaryEnv);
				return null;
			}
			case NodeType.LoopExpression: {
				const body = node.body;
				while (true) {
					const loopEnv = new Environment(env);
					const result = await evaluate(
						body,
						loopEnv,
						builtIns,
						{ ...boundaryEnv, [NodeType.AmbushStatement]: loopEnv },
						NewEnvType.LOOP
					);

					if (result === CONTINUE_SIGNAL) continue; // '偷袭~' -> 继续下次循环
					if (result === BREAK_SIGNAL) break; // '累了~' -> 退出循环
					if (result instanceof LoopValue) return result.value; // '偷袭 <值>~' -> 退出并返回值
					if (result instanceof ReturnValue) return result; // '叼回来 [值]~' -> 退出函数
					// break; // 让循环变懒（不主动重复）
				}
				return null; // '累了' 退出后，循环表达式返回“空碗”
			}
			case NodeType.BreakStatement:
				return BREAK_SIGNAL;
			case NodeType.AmbushStatement:
			case NodeType.ReturnStatement: {
				const { type, argument } = node;
				if (!argument) return ReturnOrAmbush[type].emptySignal;

				if (argument.type === NodeType.Identifier) {
					const varName = argument.symbol;
					const varScope = env.lookup(varName).scope;

					if (varScope.isInsideOf(boundaryEnv[type])) {
						throw errorFrom(argument, `运行错误喵: 不能把里面的临时玩具「${varName}」带走喵，它离开这里就消失了！`);
					}
				}

				const value = await evaluate(argument, env, builtIns, boundaryEnv);

				if (isSignal(value)) logger.warn(`[ENV #${env.id}] 携带多层信号，将继续向上传递。`);
				return ReturnOrAmbush[type].signalWith(value);
			}
			case NodeType.FunctionDeclaration:
				return env.declareFunction(node.name.symbol, node), null;
			case NodeType.CallExpression: {
				const { callee, args: argsNode } = node;
				const funcName = callee.symbol;

				const argsCollection = resolveValue(await evaluate(argsNode, env, builtIns, boundaryEnv));
				if (!(argsCollection instanceof Environment)) throw errorFrom(argsNode, `运行错误喵: 贡品要装好喵！`);

				if (isBuiltInFunctionName(funcName)) {
					const evalArgs: MeaoiuValue[] = [];
					for (const varName of argsCollection.orderedVariableNames) {
						evalArgs.push(resolveValue(argsCollection.lookup(varName)));
					}

					const builtIn = builtIns[funcName];

					const error = checkArgsForBuiltIn(builtIn, evalArgs);
					if (error) throw errorFrom(argsNode, `运行错误喵: ${error}`);

					return builtIn.function(evalArgs);
				}

				const func = env.findFunction(funcName);
				if (!func) {
					throw errorFrom(callee, `运行错误喵: 没有叫「${funcName}」的${typeNames[MeaoiuType.FUNCTION]}喵！`);
				}

				// 从函数定义的参数块中，按顺序提取出参数的名字
				const paramNames = func.parameters.body
					.map(stmt => {
						if (stmt.type === NodeType.VariableDeclaration) return stmt.identifier.symbol;
						if (stmt.type === NodeType.ExpressionStatement && stmt.expression.type === NodeType.Identifier) {
							return stmt.expression.symbol;
						}
						throw errorFrom(stmt, `运行错误喵: 贡品不能是奇怪的样子 ${stmt.type} 喵！`);
					})
					.filter(Boolean);

				if (argsCollection.length < paramNames.length) {
					throw errorFrom(
						argsNode,
						`运行错误喵: 要 ${paramNames.length} 个贡品，只给 ${argsCollection.length} 个不够喵！`
					);
				}

				const functionEnv = new Environment(env);

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
					NewEnvType.FUNC
				);
				if (result instanceof ReturnValue) return result.value;
				if (isSignal(result)) {
					logger.warn(
						`[ENV #${functionEnv.id}] 在${typeNames[MeaoiuType.FUNCTION]} '${funcName}' 中，只能把东西“叼回来”喵。`
					);
				}
				return null;
			}
			case NodeType.UnaryExpression: {
				const { operator: op, argument } = node;
				const argumentRef = await evaluate(argument, env, builtIns, boundaryEnv);
				const argumentValue = resolveValue(argumentRef);

				switch (op) {
					case AssignmentKind.COPY: // 高仿
						return argumentValue instanceof Environment ? argumentValue.createShallowCopy() : argumentValue;
					case AssignmentKind.MOVE: // 抢走
						if (!isReferenceLink(argumentRef)) throw errorFrom(argument, `运行错误喵: 只能抢走碗里的东西喵！`);
						Environment.markReferenceMoved(argumentRef); // 标记源头为已移动
						return argumentValue;
					default: // 理论不可达
						const _o: never = op;
						throw errorFrom(argument, `世界崩坏喵: 你为什么会「${_o}」喵！`);
				}
			}
			case NodeType.ExpressionStatement:
				return evaluate(node.expression, env, builtIns, boundaryEnv);
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
	builtIns: MeaoiuBuiltIns,
	boundaryEnv: BoundaryEnv,
	autoIndexCounter: number
): Promise<number> {
	const expr = stmt.expression;

	let name: string | undefined;
	let kind: AssignmentKind = AssignmentKind.COPY;

	if (expr.type === NodeType.Identifier) {
		// 元素是 `a` -> 声明为 `a`，并创建引用
		name = expr.symbol;
		kind = AssignmentKind.REFERENCE;
	} else if (expr.type === NodeType.UnaryExpression && expr.argument.type === NodeType.Identifier) {
		// 元素是 `高仿 a` 或 `抢走 a`
		name = expr.argument.symbol;
	}
	const valueToAssign = await evaluate(expr, blockEnv, builtIns, boundaryEnv); // 得到最终的值

	name ||= autoKey(autoIndexCounter++); // 没有显式名字就自动生成

	if (blockEnv.hasVariable(name)) {
		throw errorFrom(stmt, `运行错误喵: ${typeNames[MeaoiuType.COLLECTION]}里已经有一个叫做「${name}」的玩具了喵！`);
	}

	// 将这个元素“声明”到纸箱的环境中
	blockEnv.declare(name); // 这会将 name 添加到 orderedVariableNames
	blockEnv.assign(name, valueToAssign, kind);

	return autoIndexCounter;
}

async function _evaluateAssignment(
	stmt: AST.AssignmentStatement,
	env: Environment,
	builtIns: MeaoiuBuiltIns,
	boundaryEnv: BoundaryEnv,
	preExecute?: () => void
): Promise<ReturnType<Environment['assign']>> {
	const { value: assignValue, assignee, kind } = stmt;
	const value = await evaluate(assignValue, env, builtIns, boundaryEnv);

	// 目标是 a@b 这种形式
	if (assignee.type === NodeType.MemberAccessExpression) {
		const { object: objectNode, property: propertyNode } = assignee;
		// 找到纸箱
		const collection = resolveValue(await evaluate(objectNode, env, builtIns, boundaryEnv));
		if (!(collection instanceof Environment)) {
			throw errorFrom(objectNode, `运行错误喵: 只能给${typeNames[MeaoiuType.COLLECTION]}的成员赋值喵！`);
		}

		const name = await _evaluateMemberName(propertyNode, env, builtIns, boundaryEnv, collection, String);

		// 检查是“赋值”还是“扩充”
		if (!collection.hasVariable(name)) {
			logger.debug(`[ENV #${collection.id}] 纸箱扩充: '${name}'`);
			collection.declare(name); // 声明新键
		}

		return collection.assign(name, value, kind);
	}

	preExecute?.();

	// 目标是 a 这种普通变量
	const target = await evaluate(assignee, env, builtIns, boundaryEnv);
	if (!isReferenceLink(target)) throw errorFrom(assignee, `运行错误喵: 赋值的左边必须是一个碗喵！`);
	return target.scope.assign(target.name, value, kind);
}

async function _evaluateMemberName(
	prop: AST.Expression,
	env: Environment,
	builtIns: MeaoiuBuiltIns,
	boundaryEnv: BoundaryEnv,
	collection: Environment,
	catchOutRangeIndex: (index: number) => string
): Promise<string> {
	// 找到索引/键
	const propKey = resolveValue(await evaluate(prop, env, builtIns, boundaryEnv));

	switch (typeof propKey) {
		case 'string': // 字符串键，直接用
			return propKey;
		case 'number': // 数字索引
			return propKey < 1 || collection.length < propKey
				? catchOutRangeIndex(propKey) // 数字索引超出范围
				: collection.orderedVariableNames[propKey - 1]!; // 索引存在，用它在有序列表里的名字
	}
	throw errorFrom(
		prop,
		`运行错误喵: ${typeNames[MeaoiuType.COLLECTION]}的索引必须是${typeNames[MeaoiuType.NUMBER]}或${
			typeNames[MeaoiuType.STRING]
		}喵！`
	);
}
