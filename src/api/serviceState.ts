// src/api/serviceState.ts

import { builtInFunctionNames } from '../core/builtIns.js';
import { ParseMode, Parser, type ParseResult } from '../core/parser.js';
import { tokenize } from '../core/tokenizer.js';
import { analyzeSymbols, type AnalyzeResult } from './utils/symbolAnalyzer.js';

type DocState = { version: number; sourceCode: string };

export class StateManager {
	#useOnebased: boolean;
	private stateCache: WeakMap<DocState, ServiceState> = new WeakMap();

	constructor(useOnebased = true) {
		this.#useOnebased = useOnebased;
	}

	public makeDocState(version: number, sourceCode: string): DocState {
		return { version, sourceCode };
	}

	public updateState(doc: DocState): ServiceState {
		const state = new ServiceState(doc.version, doc.sourceCode, this.#useOnebased);
		this.stateCache.set(doc, state);
		return state;
	}

	public useState(doc: DocState): ServiceState {
		let state = this.stateCache.get(doc);
		if (doc.version !== state?.version) state = this.updateState(doc);
		return state;
	}

	public getParseResult(doc: DocState): ParseResult | undefined {
		return this.stateCache.get(doc)?.parseResult;
	}

	public getAnalyzeResult(doc: DocState): AnalyzeResult | undefined {
		return this.stateCache.get(doc)?.analyzeResult;
	}
}

export class ServiceState {
	#version: number;
	#parseResult: ParseResult;
	#analyzeResult?: AnalyzeResult;

	constructor(version: number, sourceCode: string, useOnebased = true) {
		this.#version = version;

		const tokens = tokenize(sourceCode, { useOnebased });
		this.#parseResult = new Parser(tokens, ParseMode.TOLERANT).parse();
	}

	get version() {
		return this.#version;
	}

	get parseResult() {
		return this.#parseResult;
	}

	get analyzeResult() {
		this.#analyzeResult ??= analyzeSymbols(this.parseResult.program, builtInFunctionNames);
		return this.#analyzeResult;
	}
}
