// src/core/run/interpreter.ts

import type * as AST from '../ast.js';
import { AssignmentOperator, LogicalOperator, NodeKind } from '../ast.js';
import { checkArgsForBuiltIn, isBuiltInFunctionName, type MeaoiuBuiltIns } from '../builtIns.js';
import { errorFrom, MeaoiuError, Phase } from '../error.js';
import type { Token } from '../tokenizer.js';
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
import {
	BREAK_SIGNAL,
	CONTINUE_SIGNAL,
	type EmptySignal,
	type Evaluated,
	isReferenceLink,
	isSignal,
	LoopValue,
	ReturnValue,
	SignalKind,
} from './value.js';

type BoundaryEnv = Partial<Record<(AST.ReturnStatement | AST.AmbushStatement)['kind'], Environment>>;
const enum NewEnvMode {
	NORMAL,
	FUNC,
	LOOP,
}

const ReturnOrAmbush = {
	[NodeKind.ReturnStatement]: {
		emptySignal: new ReturnValue(null),
		signalWith: value => new ReturnValue(value),
	},
	[NodeKind.AmbushStatement]: {
		emptySignal: CONTINUE_SIGNAL,
		signalWith: value => new LoopValue(value),
	},
} as const satisfies Record<
	keyof BoundaryEnv,
	{ emptySignal: ReturnValue | EmptySignal<SignalKind.CONTINUE>; signalWith: (value: Evaluated) => ReturnValue | LoopValue }
>;

const resolveValue = Environment.resolveValue;
const runtimeErrorFrom = (ele: AST.Node | Token, message: string) => errorFrom(ele, message, Phase.RUNTIME);

export async function evaluate(
	node: AST.Node,
	env: Environment,
	builtIns: MeaoiuBuiltIns,
	boundaryEnv: BoundaryEnv,
	newEnvMode: NewEnvMode = NewEnvMode.NORMAL,
): Promise<Evaluated> {
	try {
		switch (node.kind) {
			case NodeKind.NumericLiteral:
			case NodeKind.StringLiteral:
			case NodeKind.BooleanLiteral:
				return node.value;
			case NodeKind.NullLiteral:
				return null;
			case NodeKind.Identifier:
				return env.lookup(node.symbol);
			case NodeKind.Program: {
				let lastEvaluatedInProgram: Evaluated = null;
				for (const statement of node.body) {
					lastEvaluatedInProgram = await evaluate(statement, env, builtIns, boundaryEnv);
				}
				return lastEvaluatedInProgram;
			}
			case NodeKind.BlockExpression: {
				const { isCollection, body } = node;
				const blockEnv = newEnvMode !== NewEnvMode.NORMAL ? env : new Environment(env);

				// --- 纸箱的特殊求值规则 ---
				if (isCollection) {
					let autoIndexCounter = 0; // 自动索引计数器
					for (const stmt of body) {
						// 声明语句
						if (stmt.kind === NodeKind.VariableDeclaration) await evaluate(stmt, blockEnv, builtIns, boundaryEnv);
						// 调用辅助函数处理纯表达式
						else if (stmt.kind === NodeKind.ExpressionStatement) {
							autoIndexCounter = await _evaluateCollectionElement(
								stmt,
								blockEnv,
								builtIns,
								boundaryEnv,
								autoIndexCounter,
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

				if (newEnvMode !== NewEnvMode.NORMAL) return null; // 非普通环境只靠信号返回

				if (isReferenceLink(lastEvaluated) && lastEvaluated.scope === blockEnv) {
					const lastStmtNode = body.at(-1) ?? node;
					throw runtimeErrorFrom(lastStmtNode, `不能让里面玩具「${lastEvaluated.name}」跑出去喵！`);
				}

				return lastEvaluated;
			}
			case NodeKind.MemberAccessExpression: {
				const { object: objectNode, property: propertyNode } = node;
				const collection = resolveValue(await evaluate(objectNode, env, builtIns, boundaryEnv));

				if (!(collection instanceof Environment)) {
					throw runtimeErrorFrom(objectNode, `从${typeNames[MeaoiuType.COLLECTION]}里拿东西才能用「@」喵！`);
				}

				const name = await _evaluateMemberName(propertyNode, env, builtIns, boundaryEnv, collection, index => {
					throw runtimeErrorFrom(propertyNode, `喵呜！找不到「${index}」号玩具喵！`);
				});

				return collection.lookup(name);
			}
			case NodeKind.SequenceExpression: {
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
					if (error) throw runtimeErrorFrom(opToken, `${error}`);

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
							throw runtimeErrorFrom(opToken, `这个「${op}」这是什么节喵？`);
					}
				}
				return accVal;
			}
			case NodeKind.ArithmeticExpression: {
				const { operator: op, left, right } = node;

				const leftVal: any = resolveValue(await evaluate(left, env, builtIns, boundaryEnv));
				const rightVal: any = resolveValue(await evaluate(right, env, builtIns, boundaryEnv));

				const leftType = getMeaoiuType(leftVal);
				const rightType = getMeaoiuType(rightVal);

				const error = checkArithmeticOperation(op, leftType, rightType);
				if (error) throw runtimeErrorFrom(node, `${error}`);

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
				throw runtimeErrorFrom(node, `「${op}」是两块钱的运算符喵?`);
			}
			case NodeKind.ComparisonExpression: {
				const { expressions, operators } = node;

				let overallResult = true,
					currentLeftVal: any = resolveValue(await evaluate(expressions[0]!, env, builtIns, boundaryEnv));

				for (let i = 0; i < operators.length; i++) {
					const opToken = operators[i]!,
						op = opToken.value;
					const currentRightVal: any = resolveValue(await evaluate(expressions[i + 1]!, env, builtIns, boundaryEnv));

					const leftType = getMeaoiuType(currentLeftVal);
					const rightType = getMeaoiuType(currentRightVal);

					const error = checkComparisonOperation(op, leftType, rightType);
					if (error) throw runtimeErrorFrom(opToken, `${error}`);

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
							throw runtimeErrorFrom(opToken, `不会用「${op}」比喵~`);
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
			case NodeKind.LogicalExpression: {
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
						throw errorFrom(node, `你发现了「${_o}」悖论喵~`, Phase.INVARIANT);
				}
			}
			case NodeKind.VariableDeclaration: {
				const { identifier, initialization } = node;
				const symbol = identifier.symbol;
				// 若有初始化部分，则执行以声明并赋值
				return initialization
					? _evaluateAssignment(initialization, env, builtIns, boundaryEnv, () => env.declare(symbol))
					: env.declare(symbol); // 声明变量名
			}
			case NodeKind.AssignmentStatement:
				return _evaluateAssignment(node, env, builtIns, boundaryEnv);
			case NodeKind.IfExpression: {
				const isTrue = resolveValue(await evaluate(node.condition, env, builtIns, boundaryEnv));
				if (isTrue) return evaluate(node.consequent, env, builtIns, boundaryEnv);
				else if (node.alternate) return evaluate(node.alternate, env, builtIns, boundaryEnv);
				return null;
			}
			case NodeKind.LoopExpression: {
				const body = node.body;
				loop: for (;;) {
					const loopEnv = new Environment(env);
					const result = await evaluate(
						body,
						loopEnv,
						builtIns,
						{ ...boundaryEnv, [NodeKind.AmbushStatement]: loopEnv },
						NewEnvMode.LOOP,
					);

					if (!isSignal(result)) continue;
					switch (result.signalKind) {
						case SignalKind.CONTINUE:
							continue; // '偷袭~' -> 继续下次循环
						case SignalKind.BREAK:
							break loop; // '累了~' -> 退出循环
						case SignalKind.LOOP:
							return result.value; // '偷袭 <值>~' -> 退出并返回值
						case SignalKind.RETURN:
							return result; // '叼回来 [值]~' -> 退出函数
						default:
							const _r: never = result;
							throw runtimeErrorFrom(node, `不理解「${_r}」是什么要求喵！`);
					}
					// break; // 让循环变懒（不主动重复）
				}
				return null; // '累了' 退出后，循环表达式返回“空碗”
			}
			case NodeKind.BreakStatement:
				return BREAK_SIGNAL;
			case NodeKind.AmbushStatement:
			case NodeKind.ReturnStatement: {
				const { kind, argument } = node;
				if (!argument) return ReturnOrAmbush[kind].emptySignal;

				if (argument.kind === NodeKind.Identifier) {
					const varName = argument.symbol;
					const varScope = env.lookup(varName).scope;

					if (varScope.isInsideOf(boundaryEnv[kind])) {
						throw runtimeErrorFrom(argument, `不能把里面的临时玩具「${varName}」带走喵，它离开这里就消失了！`);
					}
				}

				const value = await evaluate(argument, env, builtIns, boundaryEnv);

				if (isSignal(value)) logger.warn(`[ENV #${env.id}] 携带多层信号，将继续向上传递。`);
				return ReturnOrAmbush[kind].signalWith(value);
			}
			case NodeKind.FunctionDeclaration:
				return (env.declareFunction(node.name.symbol, node), null);
			case NodeKind.CallExpression: {
				const { callee, args: argsNode } = node;
				const funcName = callee.symbol;

				const argsCollection = resolveValue(await evaluate(argsNode, env, builtIns, boundaryEnv));
				if (!(argsCollection instanceof Environment)) throw runtimeErrorFrom(argsNode, `贡品要装好喵！`);

				if (isBuiltInFunctionName(funcName)) {
					const evalArgs: MeaoiuValue[] = [];
					for (const varName of argsCollection.orderedVariableNames) {
						evalArgs.push(resolveValue(argsCollection.lookup(varName)));
					}

					const builtIn = builtIns[funcName];

					const error = checkArgsForBuiltIn(builtIn, evalArgs);
					if (error) throw runtimeErrorFrom(argsNode, `${error}`);

					return builtIn.function(evalArgs);
				}

				const func = env.findFunction(funcName);
				if (!func) throw runtimeErrorFrom(callee, `没有叫「${funcName}」的${typeNames[MeaoiuType.FUNCTION]}喵！`);

				// 从函数定义的参数块中，按顺序提取出参数的名字
				const paramNames = func.parameters.body
					.map(stmt => {
						if (stmt.kind === NodeKind.VariableDeclaration) return stmt.identifier.symbol;
						if (stmt.kind === NodeKind.ExpressionStatement && stmt.expression.kind === NodeKind.Identifier) {
							return stmt.expression.symbol;
						}
						throw runtimeErrorFrom(stmt, `贡品不能是奇怪的样子 ${stmt.kind} 喵！`);
					})
					.filter(Boolean);

				if (argsCollection.length < paramNames.length) {
					throw runtimeErrorFrom(
						argsNode,
						`要 ${paramNames.length} 个贡品，只给 ${argsCollection.length} 个不够喵！`,
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
					{ ...boundaryEnv, [NodeKind.ReturnStatement]: functionEnv },
					NewEnvMode.FUNC,
				);
				if (result instanceof ReturnValue) return result.value;
				if (isSignal(result)) {
					logger.warn(
						`[ENV #${functionEnv.id}] 在${typeNames[MeaoiuType.FUNCTION]} '${funcName}' 中，只能把东西“叼回来”喵。`,
					);
				}
				return null;
			}
			case NodeKind.UnaryExpression: {
				const { operator: op, argument } = node;
				const argumentRef = await evaluate(argument, env, builtIns, boundaryEnv);
				const argumentValue = resolveValue(argumentRef);

				switch (op) {
					case AssignmentOperator.COPY: // 高仿
						return argumentValue instanceof Environment ? argumentValue.createShallowCopy() : argumentValue;
					case AssignmentOperator.MOVE: // 抢走
						if (!isReferenceLink(argumentRef)) throw runtimeErrorFrom(argument, `只能抢走碗里的东西喵！`);
						Environment.markReferenceMoved(argumentRef); // 标记源头为已移动
						return argumentValue;
					default: // 理论不可达
						const _o: never = op;
						throw errorFrom(argument, `你为什么会「${_o}」喵！`, Phase.INVARIANT);
				}
			}
			case NodeKind.ExpressionStatement:
				return evaluate(node.expression, env, builtIns, boundaryEnv);
			case NodeKind.ErrorNode:
				throw runtimeErrorFrom(node, node.message);
			default: // 此处已推断为不可达
				const _n: never = node;
				throw runtimeErrorFrom(_n, `不支持的节点类型喵！${_n}`);
		}
	} catch (err) {
		if (err instanceof MeaoiuError) throw err;
		const errorMessage = err instanceof Error ? err.message : String(err);
		throw runtimeErrorFrom(node, `${errorMessage}`); // 附加上当前 AST 节点再抛出
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
	autoIndexCounter: number,
): Promise<number> {
	const expr = stmt.expression;

	let name: string | undefined,
		operator: AssignmentOperator = AssignmentOperator.COPY;

	if (expr.kind === NodeKind.Identifier) {
		// 元素是 `a` -> 声明为 `a`，并创建引用
		name = expr.symbol;
		operator = AssignmentOperator.REFERENCE;
	} else if (expr.kind === NodeKind.UnaryExpression && expr.argument.kind === NodeKind.Identifier) {
		// 元素是 `高仿 a` 或 `抢走 a`
		name = expr.argument.symbol;
	}
	const valueToAssign = await evaluate(expr, blockEnv, builtIns, boundaryEnv); // 得到最终的值

	name ||= autoKey(autoIndexCounter++); // 没有显式名字就自动生成

	if (blockEnv.hasVariable(name)) {
		throw runtimeErrorFrom(stmt, `${typeNames[MeaoiuType.COLLECTION]}里已经有一个叫做「${name}」的玩具了喵！`);
	}

	// 将这个元素“声明”到纸箱的环境中
	blockEnv.declare(name); // 这会将 name 添加到 orderedVariableNames
	blockEnv.assign(name, valueToAssign, operator);

	return autoIndexCounter;
}

async function _evaluateAssignment(
	stmt: AST.AssignmentStatement,
	env: Environment,
	builtIns: MeaoiuBuiltIns,
	boundaryEnv: BoundaryEnv,
	preExecute?: () => void,
): Promise<ReturnType<Environment['assign']>> {
	const { value: assignValue, assignee, operator } = stmt;
	const value = await evaluate(assignValue, env, builtIns, boundaryEnv);

	// 目标是 a@b 这种形式
	if (assignee.kind === NodeKind.MemberAccessExpression) {
		const { object: objectNode, property: propertyNode } = assignee;
		// 找到纸箱
		const collection = resolveValue(await evaluate(objectNode, env, builtIns, boundaryEnv));
		if (!(collection instanceof Environment)) {
			throw runtimeErrorFrom(objectNode, `只能给${typeNames[MeaoiuType.COLLECTION]}的成员赋值喵！`);
		}

		const name = await _evaluateMemberName(propertyNode, env, builtIns, boundaryEnv, collection, String);

		// 检查是“赋值”还是“扩充”
		if (!collection.hasVariable(name)) {
			logger.debug(`[ENV #${collection.id}] 纸箱扩充: '${name}'`);
			collection.declare(name); // 声明新键
		}

		return collection.assign(name, value, operator);
	}

	preExecute?.();

	// 目标是 a 这种普通变量
	const target = await evaluate(assignee, env, builtIns, boundaryEnv);
	if (!isReferenceLink(target)) throw runtimeErrorFrom(assignee, `赋值的左边必须是一个碗喵！`);
	return target.scope.assign(target.name, value, operator);
}

async function _evaluateMemberName(
	prop: AST.Expression,
	env: Environment,
	builtIns: MeaoiuBuiltIns,
	boundaryEnv: BoundaryEnv,
	collection: Environment,
	catchOutRangeIndex: (index: number) => string,
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
	throw runtimeErrorFrom(
		prop,
		`${typeNames[MeaoiuType.COLLECTION]}的索引必须是${typeNames[MeaoiuType.NUMBER]}或${typeNames[MeaoiuType.STRING]}喵！`,
	);
}
