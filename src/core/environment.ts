// src/core/environment.ts
import * as AST from './ast.js';
import logger from '../utils/logger.js';

type VariableValue = any | { isReference: true; scope: Environment; name: string };
interface Variable {
	value: VariableValue;
	moved: boolean;
}

let envCounter = 0;
export class Environment {
	private id: number;
	private parent: Environment | undefined;
	private variables: Map<string, Variable> = new Map();
	private functions: Map<string, AST.FunctionDeclaration> = new Map();

	constructor(parent?: Environment) {
		this.parent = parent;
		this.id = envCounter++;
		logger.debug(`[ENV] Created Environment #${this.id} (parent: ${this.parent?.id ?? 'none'})`);
	}

	public declare(name: string, value: any, kind: 'Move' | 'Copy'): any {
		if (this.variables.has(name)) {
			throw new Error(`变量 '${name}' 已经被声明过了喵，不能再“蹭”一次！`);
		}
		let finalValue = this.resolveValue(value);
		logger.debug(`[ENV #${this.id}] DECLARE: '${name}' with value:`, finalValue, `(kind: ${kind})`);
		if (value && value.isVariableReference && kind === 'Move') {
			const sourceScope = this.findVariableScope(value.name);
			if (sourceScope) sourceScope.variables.get(value.name)!.moved = true;
		}
		this.variables.set(name, { value: finalValue, moved: false });
		return finalValue;
	}

	public assign(name: string, value: any, kind: 'Move' | 'Copy'): any {
		const scope = this.findVariableScope(name);
		if (!scope) {
			throw new Error(`你想修改的变量「${name}」还不存在喵！请先用“蹭”来声明。`);
		}
		logger.debug(`[ENV #${this.id}] ASSIGN: '${name}'. Found in Env #${scope.id}. Calling its 'declare' method.`);
		const targetVar = scope.variables.get(name)!;
		if (targetVar.value?.isReference) {
			logger.debug(`Assigning through reference: ${name}`);
			return targetVar.value.scope.assign(targetVar.value.name, value, kind);
		}
		let finalValue = scope.resolveValue(value);
		if (value && value.isVariableReference && kind === 'Move') {
			const sourceScope = scope.findVariableScope(value.name);
			if (sourceScope) sourceScope.variables.get(value.name)!.moved = true;
		}
		scope.variables.set(name, { value: finalValue, moved: false });
		return finalValue;
	}

	public declareReference(name: string, targetScope: Environment, targetName: string) {
		this.variables.set(name, {
			value: { isReference: true, scope: targetScope, name: targetName },
			moved: false,
		});
	}

	public lookup(name: string): any {
		const scope = this.findVariableScope(name);
		if (!scope) {
			throw new Error(`咦？没找到叫做「${name}」的玩具，是不是被你藏起来了？`);
		}
		const variable = scope.variables.get(name)!;
		if (variable.moved) {
			throw new Error(`喵呜！变量「${name}」里的东西已经被拿走了，现在是只空碗！`);
		}
		logger.debug(`[ENV #${this.id}] LOOKUP: '${name}'. Found in Env #${scope.id}. Value:`, variable.value);
		// 如果查到的是个引用，就去引用的地方继续查
		if (variable.value?.isReference) {
			return variable.value.scope.lookup(variable.value.name);
		}
		return { isVariableReference: true, name, value: variable.value };
	}

	public findVariableScope(name: string): Environment | undefined {
		if (this.variables.has(name)) {
			return this;
		}
		if (this.parent) {
			return this.parent.findVariableScope(name);
		}
		return undefined;
	}

	public resolveValue(value: any): any {
		if (value && typeof value === 'object' && value.isVariableReference) {
			return this.lookup(value.name).value;
		}
		return value;
	}

	public declareFunction(name: string, func: AST.FunctionDeclaration): void {
		this.functions.set(name, func);
	}

	public lookupFunction(name: string): AST.FunctionDeclaration | undefined {
		if (this.functions.has(name)) {
			return this.functions.get(name);
		}
		return this.parent?.lookupFunction(name);
	}
}
