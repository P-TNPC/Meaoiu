// src/api/serviceState.ts

import { tokenize } from '../core/lexer/tokenizer.js';
import { ParseMode, parse, type ParseResult } from '../core/parser.js';
import { analyzeSymbols, type AnalyzeResult } from './utils/symbolAnalyzer.js';

type DocState = { version: number; getText: () => string }; // 适配 VsCode 格式

export class StateManager {
	#useOnebased: boolean;
	#stateCache: WeakMap<DocState, ServiceState> = new WeakMap();

	constructor(useOnebased = true) {
		this.#useOnebased = useOnebased;
	}

	public static makeDocState(version: number, sourceCode: string): DocState {
		return { version, getText: () => sourceCode };
	}

	public updateState(doc: DocState): ServiceState {
		const state = new ServiceState(doc.version, doc.getText(), this.#useOnebased);
		this.#stateCache.set(doc, state);
		return state;
	}

	public useState(doc: DocState): ServiceState {
		let state = this.#stateCache.get(doc);
		if (doc.version !== state?.version) state = this.updateState(doc);
		return state;
	}

	public getParseResult(doc: DocState): ParseResult | undefined {
		return this.#stateCache.get(doc)?.parseResult;
	}

	public getAnalyzeResult(doc: DocState): AnalyzeResult | undefined {
		return this.#stateCache.get(doc)?.analyzeResult;
	}
}

export class ServiceState {
	#version: number;
	#parseResult: ParseResult;
	#analyzeResult?: AnalyzeResult;

	constructor(version: number, sourceCode: string, useOnebased = true) {
		this.#version = version;
		this.#parseResult = parse(tokenize(sourceCode, { useOnebased }), ParseMode.TOLERANT);
	}

	get version(): number {
		return this.#version;
	}

	get parseResult(): ParseResult {
		return this.#parseResult;
	}

	get analyzeResult(): AnalyzeResult {
		return this.#analyzeResult ??= analyzeSymbols(this.parseResult.program);
	}
}
