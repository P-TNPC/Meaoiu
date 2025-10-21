// src/core/run/environment.ts
import type * as AST from '../ast.js';
import logger from '../run/logger.js'; // 修正了 logger 的引用路径

type VariableValue = { isReference: true; scope: Environment; name: string } | null; // 允许在声明时临时为 null
interface Variable {
	value: VariableValue;
	moved: boolean;
}
type VariableReference = { isVariableReference: true; name: string; value: VariableValue };

let envCounter = 0;
export class Environment {
	private id: number;
	private parent: Environment | undefined;
	public variables: Map<string, Variable> = new Map();
	private functions: Map<string, AST.FunctionDeclaration> = new Map();

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
		this.variables.set(name, { value: null, moved: false });
		logger.debug(`[ENV #${this.id}] DECLARE: '${name}'`);
		return null;
	}

	/**
	 * 为已存在的变量赋值。
	 */
	public assign(name: string, value: any, kind: AST.AssignmentKind): any {
		const executionScope = this; // `this` is the scope where the assignment happens.

		// 立即在当前执行作用域解析源头最终值
		const finalValue = executionScope.resolveValue(value);

		// 如果赋值操作是 'Move'，需要标记源变量为 "已移动"
		if (value?.isVariableReference && kind === 'Move') {
			const sourceScope = executionScope.findVariableScope(value.name);
			if (sourceScope) {
				const sourceVar = sourceScope.variables.get(value.name);
				if (sourceVar) sourceVar.moved = true;
			}
		}

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
			logger.debug(`跟随引用到 '${finalTargetName}' (在环境 #${finalTargetScope.id})`);
		}

		// 在最终位置赋值
		logger.debug(
			`[ENV #${executionScope.id}] ASSIGN: '${finalTargetName}' in Env #${finalTargetScope.id}. (kind: ${kind}) VALUE:`,
			finalValue
		);
		if (kind === 'Reference') {
			if (value?.isVariableReference) {
				const sourceScope = executionScope.findVariableScope(value.name);
				if (!sourceScope) throw new Error(`找不到可以引用的玩具「${value.name}」喵！`);
				finalTargetScope.variables.set(finalTargetName, {
					value: { isReference: true, scope: sourceScope, name: value.name },
					moved: false,
				});
			} else {
				// 无法引用，视作 'Copy'
				finalTargetScope.variables.set(finalTargetName, { value: finalValue, moved: false });
			}
		} else {
			// 对于 'Copy' 和 'Move'，直接赋予已经解析好的值
			finalTargetScope.variables.set(finalTargetName, { value: finalValue, moved: false });
		}

		return finalValue;
	}

	public declareReference(name: string, targetScope: Environment, targetName: string) {
		if (this.variables.has(name)) throw new Error(`变量 '${name}' 已经被“蹭”过一次了喵！`);
		this.variables.set(name, {
			value: { isReference: true, scope: targetScope, name: targetName },
			moved: false,
		});
	}

	public lookup(name: string): VariableReference {
		const scope = this.findVariableScope(name);
		if (!scope) throw new Error(`咦？没找到叫做「${name}」的玩具，是不是被你藏起来了？`);
		const variable = scope.variables.get(name)!;
		if (variable.moved) throw new Error(`喵呜！变量「${name}」里的东西已经被拿走了，现在是只空碗！`);
		logger.debug(`[ENV #${this.id}] LOOKUP: '${name}'. Found in Env #${scope.id}.`);

		if (variable.value?.isReference) {
			logger.debug(`Following reference from '${name}' to '${variable.value.name}' in Env #${variable.value.scope.id}`);
			return variable.value.scope.lookup(variable.value.name);
		}
		return { isVariableReference: true, name, value: variable.value };
	}

	public findVariableScope(name: string): Environment | undefined {
		if (this.variables.has(name)) return this;
		if (this.parent) return this.parent.findVariableScope(name);
		return undefined;
	}

	public resolveValue(value: any): any {
		if (value?.isVariableReference) return this.lookup(value.name).value;
		return value;
	}

	public declareFunction(name: string, func: AST.FunctionDeclaration): void {
		this.functions.set(name, func);
	}

	public lookupFunction(name: string): AST.FunctionDeclaration | undefined {
		if (this.functions.has(name)) return this.functions.get(name);
		return this.parent?.lookupFunction(name);
	}
}
