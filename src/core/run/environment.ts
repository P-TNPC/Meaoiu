// src/core/run/environment.ts
import type * as AST from '../ast.js';
import logger from '../run/logger.js'; // 修正了 logger 的引用路径

type VariableValue = { isReference: true; scope: Environment; name: string } | null; // 允许在声明时临时为 null
interface Variable {
	value: VariableValue;
	moved: boolean;
}
type VariableReference = { isVariableReference: true; scope: Environment; name: string; value: VariableValue };

let envCounter = 0;
export class Environment {
	public id: number;
	private parent: Environment | undefined;
	public variables: Map<string, Variable> = new Map();
	private functions: Map<string, AST.FunctionDeclaration> = new Map();
	public orderedVariableNames: string[] = [];

	constructor(parent?: Environment) {
		this.parent = parent;
		this.id = envCounter++;
		logger.debug(`[ENV] Created Environment #${this.id} (parent: ${this.parent?.id ?? 'none'})`);
	}

	/**
	 * 声明新变量（不包含赋值）。
	 */
	public declare(name: string) {
		if (this.variables.has(name)) throw new Error(`变量 '${name}' 已经被“蹭”过一次了喵！`);
		logger.debug(`[ENV #${this.id}] DECLARE: '${name}'`);
		this.variables.set(name, { value: null, moved: false });
		this.orderedVariableNames.push(name);
		return null;
	}

	/**
	 * 为已存在的变量赋值。
	 */
	public assign(name: string, value: any, kind: AST.AssignmentKind): any {
		const executionScope = this;

		// 立即在当前执行作用域解析源头最终值
		let finalValue = executionScope.resolveValue(value);

		// 如果赋值操作是 'Move'，需要标记源变量为 "已移动"
		if (value?.isVariableReference && kind === 'Move') value.scope.variables.get(value.name)!.moved = true;

		// 查找并追踪目标的最终存放位置
		const initialTargetScope = executionScope.findVariableScope(name);
		if (!initialTargetScope) throw new Error(`你想修改的变量「${name}」还不认识喵！请先用“蹭”一下喵。`);

		let finalTargetScope = initialTargetScope;
		let finalTargetName = name;
		let targetVar = finalTargetScope.variables.get(finalTargetName)!;

		// 顺着引用链一直往下找，找到真正的“碗”
		while (targetVar.value?.isReference) {
			finalTargetScope = targetVar.value.scope;
			finalTargetName = targetVar.value.name;
			targetVar = finalTargetScope.variables.get(finalTargetName)!;
		}

		// 在最终位置赋值
		logger.debug(
			`[ENV #${executionScope.id}] ASSIGN: '${finalTargetName}' in Env #${finalTargetScope.id}. (kind: ${kind}) VALUE:`,
			finalValue
		);
		if (kind === 'Reference') {
			if (value?.isVariableReference) {
				finalTargetScope.variables.set(finalTargetName, {
					value: { isReference: true, scope: value.scope, name: value.name },
					moved: false,
				});
				return finalValue;
			}
		} else if (kind === 'Copy' && finalValue instanceof Environment) {
			// 复制一个集合，实际上是创建一个“视图”
			finalValue = finalValue.createShallowCopy();
		}
		finalTargetScope.variables.set(finalTargetName, { value: finalValue, moved: false });

		return finalValue;
	}

	public declareReference(name: string, targetScope: Environment, targetName: string) {
		if (this.variables.has(name)) throw new Error(`变量 '${name}' 已经被“蹭”过一次了喵！`);
		this.variables.set(name, {
			value: { isReference: true, scope: targetScope, name: targetName },
			moved: false,
		});
		this.orderedVariableNames.push(name);// 确保引用也被添加到有序列表中
	}

	public lookup(name: string | number): VariableReference {
		let resolvedName = '';
		if (typeof name === 'number') {
			if (name < 1 || name > this.orderedVariableNames.length) throw new Error(`喵呜！找不到索引为 ${name} 的玩具！`);
			resolvedName = this.orderedVariableNames[name - 1]!;
		} else {
			resolvedName = name as string;
		}

		const scope = this.findVariableScope(resolvedName);
		if (!scope) throw new Error(`咦？没找到叫做「${resolvedName}」的玩具，是不是被你藏起来了？`);
		const variable = scope.variables.get(resolvedName)!;
		if (variable.moved) throw new Error(`喵呜！变量「${resolvedName}」里的东西已经被拿走了，现在是只空碗！`);
		logger.debug(`[ENV #${this.id}] LOOKUP: '${resolvedName}'. Found in Env #${scope.id}.`);

		if (variable.value?.isReference) return variable.value.scope.lookup(variable.value.name);

		return { isVariableReference: true, scope: scope, name: resolvedName, value: variable.value };
	}

	public findVariableScope(name: string): Environment | undefined {
		if (this.variables.has(name)) return this;
		if (this.parent) return this.parent.findVariableScope(name);
		return undefined;
	}

	public resolveValue(value: any): any {
		if (value?.isVariableReference) return value.value;
		return value;
	}

	public declareFunction(name: string, func: AST.FunctionDeclaration): void {
		this.functions.set(name, func);
	}

	public lookupFunction(name: string): AST.FunctionDeclaration | undefined {
		if (this.functions.has(name)) return this.functions.get(name);
		return this.parent?.lookupFunction(name);
	}

	public createShallowCopy(): Environment {
		const newEnv = new Environment(this.parent);
		for (const varName of this.orderedVariableNames) {
			const originalVarRef = this.lookup(varName);
			newEnv.declareReference(varName, originalVarRef.scope, originalVarRef.name);
		}
		return newEnv;
	}
}
