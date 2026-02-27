// src/core/tokenizer.ts

import { preprocess } from './preprocessor.js';
import { MeaoiuBuiltInNames } from './builtIns.js';

export const enum TokenKind {
	ERROR, //不认识的字符喵

	// 关键字
	KEYWORD_USE,
	KEYWORD_IS,
	KEYWORD_LIKE,
	KEYWORD_ONLY,
	KEYWORD_CLONE,
	KEYWORD_MOVE,
	KEYWORD_CONFIRM,
	KEYWORD_ELSE,
	KEYWORD_LOOP,
	KEYWORD_BREAK,
	KEYWORD_AMBUSH,
	KEYWORD_DEF,
	KEYWORD_CALL,
	KEYWORD_RETURN,

	// 字面量
	NUMBER,
	STRING,
	BOOLEAN,
	NULL,

	// 标识符
	IDENTIFIER,

	// 符号
	COLLECTION_START, // [=
	COLLECTION_END, // =]
	BLOCK_START, // [#
	BLOCK_END, // #]
	TERMINATOR, // ~
	ACCESSOR, // @
	OPERATOR, // +, -, *, /, ==, !=, >, <, >=, <=
	COMMA, // ,

	// 逻辑
	LOGIC_AND, // 和
	LOGIC_OR, // 或
	LOGIC_CLOSE_AND, // 都好
	LOGIC_CLOSE_OR, // 有好
	LOGIC_CLOSE_NAND, // 有坏
	LOGIC_CLOSE_NOR, // 都坏

	// 其他
	COMMENT,
	EOF,
}

export const KEYWORDS = {
	蹭: TokenKind.KEYWORD_USE,
	就是: TokenKind.KEYWORD_IS,
	就像: TokenKind.KEYWORD_LIKE,
	高仿: TokenKind.KEYWORD_CLONE,
	才是: TokenKind.KEYWORD_ONLY,
	抢走: TokenKind.KEYWORD_MOVE,
	'好不好?': TokenKind.KEYWORD_CONFIRM,
	不然: TokenKind.KEYWORD_ELSE,
	玩耍: TokenKind.KEYWORD_LOOP,
	累了: TokenKind.KEYWORD_BREAK,
	想要: TokenKind.KEYWORD_DEF,
	扒: TokenKind.KEYWORD_CALL,
	叼回来: TokenKind.KEYWORD_RETURN,
	偷袭: TokenKind.KEYWORD_AMBUSH,
	好喵: TokenKind.BOOLEAN,
	坏喵: TokenKind.BOOLEAN,
	空碗: TokenKind.NULL,
	和: TokenKind.LOGIC_AND,
	或: TokenKind.LOGIC_OR,
	都好: TokenKind.LOGIC_CLOSE_AND,
	有好: TokenKind.LOGIC_CLOSE_OR,
	都坏: TokenKind.LOGIC_CLOSE_NOR,
	有坏: TokenKind.LOGIC_CLOSE_NAND,
} as const satisfies Record<string, TokenKind>;
export type Keyword = keyof typeof KEYWORDS;
export function isKeyword(symbol: string): symbol is Keyword {
	return symbol in KEYWORDS;
}

export const sortedKeywords = Object.keys(KEYWORDS).sort((a, b) => b.length - a.length) as Keyword[];

export const OP_ARITH = new Set(['+', '-', '*', '/']);
export const OP_COMP = new Set(['==', '!=', '>', '<', '>=', '<=']);
export const OP_COMP_E = new Set(['==', '!=']);
const TWO_CHAR_SYMBOLS = new Set(['==', '!=', '>=', '<=', '[=', '=]', '[#', '#]']);

export type Token = {
	kind: TokenKind;
	value: string;
	line: number;
	col: number;
};

export type TokenizerOptions = {
	ignoreComments?: boolean;
	convertFullWidth?: boolean;
	useOnebased?: boolean;
};

export function tokenize(sourceCode: string, options?: TokenizerOptions): Token[] {
	const { ignoreComments = true, convertFullWidth = true, useOnebased = true } = options ?? {};
	const OriginBase = +useOnebased;
	if (convertFullWidth) sourceCode = preprocess(sourceCode);

	// 小本本：记函数
	const functionNames = new Set<string>(MeaoiuBuiltInNames);
	let expectingFuncNameAfterParamEnd = false;

	const tokens: Token[] = [];
	let line = OriginBase,
		col = OriginBase,
		cursor = 0;

	const advance = (steps = 1) => {
		for (let i = 0; i < steps; i++) {
			if (sourceCode[cursor + i] === '\n') {
				line++;
				col = OriginBase;
			} else {
				col++;
			}
		}
		cursor += steps;
	};

	while (cursor < sourceCode.length) {
		const startLine = line;
		const startCol = col;
		let char = sourceCode[cursor]!;

		if (/\s/.test(char)) {
			advance();
			continue;
		}

		if (char === '(') {
			let commentContent = '';
			let nestingLevel = 1;
			const commentStartLine = line;
			const commentStartCol = col;

			advance();

			while (nestingLevel > 0 && cursor < sourceCode.length) {
				char = sourceCode[cursor]!;
				if (char === '(') nestingLevel++;
				else if (char === ')') nestingLevel--;

				if (nestingLevel > 0) commentContent += char;
				advance();
			}

			if (nestingLevel !== 0) console.error('警告喵: 文件结尾有未闭合的悄悄话！');

			if (!ignoreComments) {
				tokens.push({ kind: TokenKind.COMMENT, value: commentContent, line: commentStartLine, col: commentStartCol });
			}
			continue;
		}

		const remainingCode = sourceCode.substring(cursor);
		let matchedKeyword: Keyword | undefined;
		for (const keyword of sortedKeywords) {
			if (remainingCode.startsWith(keyword)) {
				matchedKeyword = keyword;
				break;
			}
		}
		if (matchedKeyword) {
			const tokenKind = KEYWORDS[matchedKeyword];
			tokens.push({ kind: tokenKind, value: matchedKeyword, line: startLine, col: startCol });
			advance(matchedKeyword.length);

			if (tokenKind === TokenKind.KEYWORD_DEF) expectingFuncNameAfterParamEnd = true; // '想要'
			continue;
		}

		const twoCharSymbol = sourceCode.substring(cursor, cursor + 2);
		if (TWO_CHAR_SYMBOLS.has(twoCharSymbol)) {
			let kind: TokenKind = TokenKind.OPERATOR;
			if (twoCharSymbol === '[=') kind = TokenKind.COLLECTION_START;
			else if (twoCharSymbol === '=]') kind = TokenKind.COLLECTION_END;
			else if (twoCharSymbol === '[#') kind = TokenKind.BLOCK_START;
			else if (twoCharSymbol === '#]') kind = TokenKind.BLOCK_END;
			tokens.push({ kind, value: twoCharSymbol, line: startLine, col: startCol });
			advance(2);

			if (kind !== TokenKind.COLLECTION_END) expectingFuncNameAfterParamEnd = false;
			continue;
		}

		if ('+-*/><@~,'.includes(char)) {
			let kind: TokenKind = TokenKind.OPERATOR;
			if (char === ',') kind = TokenKind.COMMA;
			else if (char === '@') kind = TokenKind.ACCESSOR;
			else if (char === '~') kind = TokenKind.TERMINATOR;
			tokens.push({ kind, value: char, line: startLine, col: startCol });
			advance();
			continue;
		}

		if (/\d/.test(char)) {
			let numStr = '';
			while (cursor < sourceCode.length && /\d/.test(sourceCode[cursor]!)) {
				numStr += sourceCode[cursor];
				advance();
			}
			tokens.push({ kind: TokenKind.NUMBER, value: numStr, line: startLine, col: startCol });
			continue;
		}

		if (char === '"' || char === "'") {
			const quoteType = char;
			let str = '';
			advance();
			while (cursor < sourceCode.length && sourceCode[cursor] !== quoteType) {
				str += sourceCode[cursor];
				advance();
			}
			advance();
			tokens.push({ kind: TokenKind.STRING, value: str, line: startLine, col: startCol });
			continue;
		}

		if (/[\u4e00-\u9fa5a-zA-Z_]/.test(char) || char === '{') {
			let identifier = '';
			let identifierStartLine: number;
			let identifierStartCol: number;

			if (char === '{') {
				advance(); // 1. 先跳过 '{'

				// 2. 然后再记录标识符真正的起始位置
				identifierStartLine = line;
				identifierStartCol = col;

				while (cursor < sourceCode.length && sourceCode[cursor] !== '}') {
					identifier += sourceCode[cursor];
					advance();
				}
				advance(); // 跳过 '}'
			} else {
				// 对于普通标识符，直接记录当前位置
				identifierStartLine = line;
				identifierStartCol = col;

				while (cursor < sourceCode.length && /[\u4e00-\u9fa5a-zA-Z0-9_]/.test(sourceCode[cursor]!)) {
					const lookahead = sourceCode.substring(cursor);
					let isKeywordAhead = false;
					for (const keyword of sortedKeywords) {
						if (lookahead.startsWith(keyword)) {
							isKeywordAhead = true;
							break;
						}
					}
					if (isKeywordAhead) break;
					identifier += sourceCode[cursor];
					advance();
				}
			}

			// 最后，统一创建 Token
			if (identifier) {
				tokens.push({
					kind: TokenKind.IDENTIFIER,
					value: identifier,
					line: identifierStartLine,
					col: identifierStartCol,
				});
				if (expectingFuncNameAfterParamEnd) {
					// 抓到了！这个标识符就是函数名喵！
					functionNames.add(identifier);
					expectingFuncNameAfterParamEnd = false; // 重置状态
				}
			}
			continue;
		}

		// 不认识的字符喵
		tokens.push({ kind: TokenKind.ERROR, value: char, line: startLine, col: startCol });
		console.error('不认识的字符喵:', char);

		advance();
	}

	tokens.push({ kind: TokenKind.EOF, value: 'EndOfFile', line, col });
	return repairCallTokens(tokens, functionNames);
}

/**
 * 遍历原始 Token 列表，修复被错误合并的 `扒纸箱名函数名`。
 */
function repairCallTokens(tokens: Token[], functionNames: Set<string>): Token[] {
	// 为了最高效的匹配，按长度降序排序
	// 这样能确保 `喵` 不会错误地匹配 `xxx高级喵` 的 `喵`
	const sortedFunctionNames = Array.from(functionNames).sort((a, b) => b.length - a.length);

	const repairedTokens: Token[] = [];
	let i = 0;

	while (i < tokens.length) {
		const currentToken = tokens[i]!;
		const nextToken = tokens[i + 1];
		const nextNextToken = tokens[i + 2];

		// 检查是否是需要修复的目标
		if (
			currentToken.kind !== TokenKind.KEYWORD_CALL || // 不是 '扒'
			nextToken?.kind !== TokenKind.IDENTIFIER || // 后面无跟着的标识符
			nextNextToken?.kind === TokenKind.IDENTIFIER // 后面跟着第二个标识符
		) {
			// 不是需要修复的目标，或者是一个安全的 `扒 纸箱名 函数名`
			repairedTokens.push(currentToken);
			i++;
			continue;
		}

		// 找到了一个潜在目标，例如 '扒 纸箱名函数名 ~'
		const tokenToSplit = nextToken;
		let foundSplit = false;

		for (const funcName of sortedFunctionNames) {
			// 检查这个函数名是不是标识符的后缀
			if (!tokenToSplit.value.endsWith(funcName) || tokenToSplit.value.length <= funcName.length) continue;
			// 找到了！是它喵！
			const collectionName = tokenToSplit.value.substring(0, tokenToSplit.value.length - funcName.length);

			// 1. 创建“纸箱名” Token
			const collectionToken: Token = {
				kind: TokenKind.IDENTIFIER,
				value: collectionName,
				line: tokenToSplit.line,
				col: tokenToSplit.col,
			};

			// 2. 创建“函数名” Token，注意计算新的列号
			const functionToken: Token = {
				kind: TokenKind.IDENTIFIER,
				value: funcName,
				line: tokenToSplit.line,
				col: tokenToSplit.col + collectionName.length,
			};

			// 3. 将修复后的 Token 推入
			repairedTokens.push(currentToken); // 扒
			repairedTokens.push(collectionToken); // 纸箱名
			repairedTokens.push(functionToken); // 函数名

			i += 2; // 跳过 '扒' 和 '纸箱名函数名' 这两个原始 Token
			foundSplit = true;
			break; // 匹配成功，停止搜索
		}

		// 如果没找到匹配，说明它就是一个普通的 `扒 某个变量`，正常推入
		if (!foundSplit) {
			repairedTokens.push(currentToken);
			i++;
		}
	}

	return repairedTokens;
}
