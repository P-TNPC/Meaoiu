// src/core/tokenizer.ts

import { preprocess } from './preprocessor.js';
import { builtInFunctionNames } from './builtIns.js';

export const enum TokenType {
	// 关键字
	KEYWORD_USE,
	KEYWORD_IS,
	KEYWORD_LIKE,
	KEYWORD_CLONE,
	KEYWORD_ONLY,
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
	NULL_LITERAL,

	// 标识符
	IDENTIFIER,

	// 符号
	PARAM_START, // [=
	PARAM_END, // =]
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
	蹭: TokenType.KEYWORD_USE,
	就是: TokenType.KEYWORD_IS,
	就像: TokenType.KEYWORD_LIKE,
	高仿: TokenType.KEYWORD_CLONE,
	才是: TokenType.KEYWORD_ONLY,
	抢走: TokenType.KEYWORD_MOVE,
	'好不好?': TokenType.KEYWORD_CONFIRM,
	不然: TokenType.KEYWORD_ELSE,
	玩耍: TokenType.KEYWORD_LOOP,
	累了: TokenType.KEYWORD_BREAK,
	想要: TokenType.KEYWORD_DEF,
	扒: TokenType.KEYWORD_CALL,
	叼回来: TokenType.KEYWORD_RETURN,
	偷袭: TokenType.KEYWORD_AMBUSH,
	好喵: TokenType.BOOLEAN,
	坏喵: TokenType.BOOLEAN,
	空碗: TokenType.NULL_LITERAL,
	和: TokenType.LOGIC_AND,
	或: TokenType.LOGIC_OR,
	都好: TokenType.LOGIC_CLOSE_AND,
	有好: TokenType.LOGIC_CLOSE_OR,
	都坏: TokenType.LOGIC_CLOSE_NOR,
	有坏: TokenType.LOGIC_CLOSE_NAND,
} as const satisfies Record<string, TokenType>;
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
	type: TokenType;
	value: string;
	line: number;
	col: number;
};

export type TokenizerOptions = {
	ignoreComments?: boolean;
	convertFullWidth?: boolean;
};

export function tokenize(sourceCode: string, options: TokenizerOptions): Token[] {
	options.convertFullWidth ??= true;
	if (options?.convertFullWidth) sourceCode = preprocess(sourceCode);

	// 小本本：记函数
	const functionNames = new Set<string>(builtInFunctionNames);
	let expectingFuncNameAfterParamEnd = false;

	const tokens: Token[] = [];
	let line = 1;
	let col = 1;
	let cursor = 0;

	const advance = (steps = 1) => {
		for (let i = 0; i < steps; i++) {
			if (sourceCode[cursor + i] === '\n') {
				line++;
				col = 1;
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

			if (!options?.ignoreComments) {
				tokens.push({ type: TokenType.COMMENT, value: commentContent, line: commentStartLine, col: commentStartCol });
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
			const tokenType = KEYWORDS[matchedKeyword];
			tokens.push({ type: tokenType, value: matchedKeyword, line: startLine, col: startCol });
			advance(matchedKeyword.length);

			if (tokenType === TokenType.KEYWORD_DEF) expectingFuncNameAfterParamEnd = true; // '想要'
			continue;
		}

		const twoCharSymbol = sourceCode.substring(cursor, cursor + 2);
		if (TWO_CHAR_SYMBOLS.has(twoCharSymbol)) {
			let type: TokenType = TokenType.OPERATOR;
			if (twoCharSymbol === '[=') type = TokenType.PARAM_START;
			else if (twoCharSymbol === '=]') type = TokenType.PARAM_END;
			else if (twoCharSymbol === '[#') type = TokenType.BLOCK_START;
			else if (twoCharSymbol === '#]') type = TokenType.BLOCK_END;
			tokens.push({ type, value: twoCharSymbol, line: startLine, col: startCol });
			advance(2);

			if (type !== TokenType.PARAM_END) expectingFuncNameAfterParamEnd = false;
			continue;
		}

		if ('+-*/><@~,'.includes(char)) {
			let type: TokenType = TokenType.OPERATOR;
			if (char === ',') type = TokenType.COMMA;
			else if (char === '@') type = TokenType.ACCESSOR;
			else if (char === '~') type = TokenType.TERMINATOR;
			tokens.push({ type, value: char, line: startLine, col: startCol });
			advance();
			continue;
		}

		if (/\d/.test(char)) {
			let numStr = '';
			while (cursor < sourceCode.length && /\d/.test(sourceCode[cursor]!)) {
				numStr += sourceCode[cursor];
				advance();
			}
			tokens.push({ type: TokenType.NUMBER, value: numStr, line: startLine, col: startCol });
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
			tokens.push({ type: TokenType.STRING, value: str, line: startLine, col: startCol });
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
					type: TokenType.IDENTIFIER,
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

		console.error('不认识的字符喵:', char);
		advance();
	}

	tokens.push({ type: TokenType.EOF, value: 'EndOfFile', line, col });
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
			currentToken.type !== TokenType.KEYWORD_CALL || // 不是 '扒'
			nextToken?.type !== TokenType.IDENTIFIER || // 后面无跟着的标识符
			nextNextToken?.type === TokenType.IDENTIFIER // 后面跟着第二个标识符
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
				type: TokenType.IDENTIFIER,
				value: collectionName,
				line: tokenToSplit.line,
				col: tokenToSplit.col,
			};

			// 2. 创建“函数名” Token，注意计算新的列号
			const functionToken: Token = {
				type: TokenType.IDENTIFIER,
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
