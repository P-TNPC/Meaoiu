// src/core/run/environment.ts

import type * as AST from '../ast.js';
import { TokenKind } from '../lexer/tokenizer.js';
import logger from '../run/logger.js';
import { MeaoiuType, typeNames, type MeaoiuValue } from '../typedef.js';
import {
	isReferenceLink,
	isSignal,
	type EnvVariable,
	type Evaluated,
	type ReferenceLink,
	type VariableValue,
} from './value.js';

// 防碰撞自动变量名
export const autoKey = (index: number) => `}${index}{`; // 使用不合语法的反花括号
const isAutoKey = (key: string) => key[0] === '}' && key[key.length - 1] === '{';

export class Environment {
	public readonly id: number;
	private static idCounter = 0;
	private readonly parent: Environment | undefined;
	private readonly variables: Map<string, EnvVariable> = new Map();
	private readonly functions: Map<string, AST.FunctionDeclaration> = new Map();
	public readonly orderedVariableNames: string[] = [];

	constructor(parent?: Environment) {
		this.parent = parent;
		this.id = Environment.idCounter++;
		logger.debug(`[ENV] 新建环境 #${this.id} (上级: ${this.parent?.id ?? '无'})`);
	}

	public static markReferenceMoved(ref: ReferenceLink): void {
		ref.scope.variables.get(ref.name)!.moved = true;
	}

	public static resolveValue(this: void, value: Evaluated): MeaoiuValue {
		if (isSignal(value)) throw new Error(`不能在这里发送神秘信号喵！`);
		while (isReferenceLink(value)) value = value.scope.variables.get(value.name)!.value;
		return value;
	}

	public hasVariable(name: string): boolean {
		return this.variables.has(name);
	}

	/**
	 * 声明新变量（不包含赋值）。
	 */
	public declare(name: string): ReferenceLink {
		if (this.variables.has(name)) throw new Error(`变量「${name}」已经被“蹭”过一次了喵！`);
		logger.debug(`[ENV #${this.id}] 声明: 变量「${name}」`);
		this.variables.set(name, { value: null, moved: false });
		this.orderedVariableNames.push(name);
		return this.lookup(name);
	}

	/**
	 * 为已存在的变量赋值。
	 */
	public assign(name: string, value: Evaluated, operator: AST.AssignmentStatement['operator']): ReferenceLink {
		// 查找并追踪目标的最终存放位置
		const initialTargetScope = this.findVariableScope(name);
		if (!initialTargetScope) throw new Error(`还不认识「${name}」喵！要先“蹭”一下喵！`);

		let finalTargetScope = initialTargetScope;
		let finalTargetName = name;

		// 顺着引用链一直往下找，找到真正的「碗」
		for (
			let targetVar: EnvVariable | undefined;
			(targetVar = finalTargetScope.variables.get(finalTargetName)) && isReferenceLink(targetVar.value);
			{ scope: finalTargetScope, name: finalTargetName } = targetVar.value
		);

		// 在最终位置赋值
		let finalValue: VariableValue;
		if (operator === TokenKind.ASSIGNMENT_IS) {
			finalValue =
				isReferenceLink(value) &&
				(finalTargetScope !== value.scope || finalTargetName !== value.name) /* 防御循环引用 */
					? value
					: Environment.resolveValue(value);
		} else {
			finalValue = Environment.resolveValue(value);
			if (operator === TokenKind.ASSIGNMENT_ONLY) {
				if (isReferenceLink(value)) Environment.markReferenceMoved(value); // 引用被移动，标记为「已移动」
			} else if (operator === TokenKind.ASSIGNMENT_LIKE && finalValue instanceof Environment) {
				finalValue = finalValue.createShallowCopy(); // 复制一个纸箱，实际上是创建一个「视图」
			}
		}
		finalTargetScope.variables.set(finalTargetName, { value: finalValue, moved: false });
		logger.debug(
			`[ENV #${this.id}] 赋值: 环境 #${finalTargetScope.id} 中的「${finalTargetName}」被赋予 (方式: ${operator}) 值:`,
			finalValue,
		);

		return finalTargetScope.lookup(finalTargetName);
	}

	public lookup(name: string, originalName: string = name /* 未定源时为第一环查询 */, checkMoved = true): ReferenceLink {
		// 查找符号
		const scope = this.findVariableScope(name);
		if (!scope) {
			const errorMessage = this.findFunction(name)
				? `是不是想把${typeNames[MeaoiuType.FUNCTION]}「${name}」当成玩具喵？`
				: `没找到叫做「${name}」的玩具，是不是被你藏起来了喵？`;
			throw new Error(`咦？${errorMessage}`);
		}
		const { value, moved } = scope.variables.get(name)!;

		// 检查「已移动」状态
		if (moved && checkMoved) {
			const errorMessage = isAutoKey(originalName)
				? `纸箱里的「${this.orderedVariableNames.indexOf(originalName) + 1}」号玩具不见了，一定是被谁拿走了喵！`
				: originalName === name
					? `藏在「${originalName}」里的东西被拿走了，现在是只空碗喵！`
					: `碰不到「${originalName}」，因为它的本体「${name}」被拿走了喵！`; // 起终点不一致，报告起终点
			throw new Error(`喵呜！${errorMessage}`);
		}
		logger.debug(`[ENV #${this.id}] 查找: 在环境 #${scope.id} 中找到「${name}」`);

		// 递归查找（继续传递 originalName）
		if (isReferenceLink(value)) return value.scope.lookup(value.name, originalName, checkMoved);

		return { isReference: true, scope, name };
	}

	private findVariableScope(name: string): Environment | undefined {
		return this.variables.has(name) ? this : this.parent?.findVariableScope(name);
	}

	public declareFunction(name: string, func: AST.FunctionDeclaration): void {
		this.functions.set(name, func);
	}

	public findFunction(name: string): AST.FunctionDeclaration | undefined {
		return this.functions.get(name) ?? this.parent?.findFunction(name);
	}

	public declareReference(name: string, targetScope: Environment, targetName: string): void {
		if (this.variables.has(name)) throw new Error(`已经“蹭”过一次「${name}」了喵！`);
		this.variables.set(name, {
			value: { isReference: true, scope: targetScope, name: targetName },
			moved: false,
		});
		this.orderedVariableNames.push(name); // 确保引用也被添加到有序列表中
	}

	public createShallowCopy(): Environment {
		const newEnv = new Environment(this.parent);
		for (const varName of this.orderedVariableNames) {
			const originalVarRef = this.lookup(varName, undefined, false);
			newEnv.declareReference(varName, originalVarRef.scope, originalVarRef.name);
		}
		return newEnv;
	}

	/**
	 * 创建一个「合并视图」。
	 * 将创建一个新纸箱，该纸箱按顺序包含来自 A (this) 和 B (other) 的所有引用。
	 * 自动生成的键（}?{）会被重命名以保证顺序。
	 * 用户定义的键如果冲突，A 优先。
	 */
	public createMergedView(other: Environment): Environment {
		const newEnv = new Environment(this.parent);
		const addedKeys = new Set<string>();
		let autoIndexCounter = 0; // 为新视图创建全新的自动索引

		// 1. 添加来自 A (this) 的所有引用
		for (const varName of this.orderedVariableNames) {
			const originalVarRef = this.lookup(varName, undefined, false);

			if (isAutoKey(varName)) {
				// 重命名自动键
				const newAutoKey = autoKey(autoIndexCounter++);
				newEnv.declareReference(newAutoKey, originalVarRef.scope, originalVarRef.name);
			} else {
				// 添加用户定义的键
				newEnv.declareReference(varName, originalVarRef.scope, originalVarRef.name);
				addedKeys.add(varName);
			}
		}

		// 2. 添加来自 B (other) 的引用
		for (const varName of other.orderedVariableNames) {
			const originalVarRef = other.lookup(varName, undefined, false);

			if (isAutoKey(varName)) {
				// 总是添加并重命名自动键
				const newAutoKey = autoKey(autoIndexCounter++);
				newEnv.declareReference(newAutoKey, originalVarRef.scope, originalVarRef.name);
			} else if (!addedKeys.has(varName)) {
				// 用户定义的键，检查冲突
				newEnv.declareReference(varName, originalVarRef.scope, originalVarRef.name);
				addedKeys.add(varName);
			}
		}

		return newEnv;
	}

	/**
	 * 检查当前环境是否严格位于 ancestor 的「内部」。
	 */
	public isInsideOf(ancestor: Environment | undefined): boolean {
		if (!ancestor) return false;
		for (let current: Environment | undefined = this; current; current = current.parent) {
			if (current === ancestor) return true;
		}
		return false;
	}

	public toString(): string {
		return `[= ${this.orderedVariableNames
			.map((name, index) => (isAutoKey(name) ? `(${index + 1})` : `{${name}}`))
			.join(', ')} =]`;
	}

	public get length(): number {
		return this.orderedVariableNames.length;
	}
}
