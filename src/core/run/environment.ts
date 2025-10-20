// src/core/run/environment.ts
import type * as AST from '../ast.js';
import logger from '../run/logger.js'; // 修正了 logger 的引用路径

type VariableValue = { isReference: true; scope: Environment; name: string };
interface Variable {
	value: VariableValue;
	moved: boolean;
}
type VariableReference = { isVariableReference: true; name: string; value: VariableValue };

let envCounter = 0;
export class Environment {
	private id: number;
	private parent: Environment | undefined;
	public variables: Map<string, Variable> = new Map(); // 改为 public 供修复代码访问
	private functions: Map<string, AST.FunctionDeclaration> = new Map();

	constructor(parent?: Environment) {
		this.parent = parent;
		this.id = envCounter++;
		logger.debug(`[ENV] Created Environment #${this.id} (parent: ${this.parent?.id ?? 'none'})`);
	}

	public declare(name: string, value: any, kind: AST.AssignmentKind): any {
		if (this.variables.has(name)) throw new Error(`变量 '${name}' 已经被“蹭”过一次了喵！`);
		logger.debug(`[ENV #${this.id}] DECLARE: '${name}' (kind: ${kind}) VALUE:`, value);

		switch (kind) {
			case 'Reference':
				if (value?.isVariableReference) {
					const sourceScope = this.findVariableScope(value.name);
					if (sourceScope) {
						this.variables.set(name, {
							value: { isReference: true, scope: sourceScope, name: value.name },
							moved: false,
						});
					}
				} else {
					// 非变量引用，视作移动
					const finalValue = this.resolveValue(value);
					this.variables.set(name, { value: finalValue, moved: false });
				}
				break;
			case 'Copy':
				const finalValueCopy = this.resolveValue(value);
				this.variables.set(name, { value: finalValueCopy, moved: false });
				break;
			case 'Move':
				const finalValueMove = this.resolveValue(value);
				if (value?.isVariableReference) {
					const sourceScope = this.findVariableScope(value.name);
					if (sourceScope) sourceScope.variables.get(value.name)!.moved = true;
				}
				this.variables.set(name, { value: finalValueMove, moved: false });
				break;
		}
		return value;
	}

	public assign(name: string, value: any, kind: AST.AssignmentKind): any {
		const targetScope = this.findVariableScope(name);
		if (!targetScope) throw new Error(`你想修改的变量「${name}」还不认识喵！请先用“蹭”一下喵。`);

		logger.debug(`[ENV #${this.id}] ASSIGN: '${name}'. Found in Env #${targetScope.id}. (kind: ${kind}) VALUE:`, value);

		const targetVar = targetScope.variables.get(name)!;
		if (targetVar.value?.isReference) {
			logger.debug(`Assigning through reference: ${name}`);
			return targetVar.value.scope.assign(targetVar.value.name, value, kind);
		}

		let finalValue = this.resolveValue(value);

		if (value?.isVariableReference && kind === 'Move') {
			const sourceScope = this.findVariableScope(value.name);
			if (sourceScope) sourceScope.variables.get(value.name)!.moved = true;
		}

		targetScope.variables.set(name, { value: finalValue, moved: false });
		return finalValue;
	}

	public declareReference(name: string, targetScope: Environment, targetName: string) {
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
