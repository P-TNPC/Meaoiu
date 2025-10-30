// src/core/tokenizer.ts

import { preprocess } from './preprocessor.js';
import { builtInFunctionNames } from './builtIns.js';

export type TokenType =
	| 'KEYWORD_USE'
	| 'KEYWORD_IS'
	| 'KEYWORD_LIKE'
	| 'KEYWORD_CLONE'
	| 'KEYWORD_ONLY'
	| 'KEYWORD_MOVE'
	| 'KEYWORD_CONFIRM'
	| 'KEYWORD_ELSE'
	| 'KEYWORD_LOOP'
	| 'KEYWORD_BREAK'
	| 'KEYWORD_DEF'
	| 'KEYWORD_CALL'
	| 'KEYWORD_RETURN'
	| 'KEYWORD_AMBUSH'
	| 'NUMBER'
	| 'STRING'
	| 'BOOLEAN'
	| 'NULL_LITERAL'
	| 'IDENTIFIER'
	| 'PARAM_START'
	| 'PARAM_END'
	| 'BLOCK_START'
	| 'BLOCK_END'
	| 'TERMINATOR'
	| 'ACCESSOR'
	| 'OPERATOR'
	| 'COMMA'
	| 'EOF'
	| 'LOGIC_AND'
	| 'LOGIC_OR'
	| 'LOGIC_CLOSE_AND'
	| 'LOGIC_CLOSE_OR'
	| 'LOGIC_CLOSE_NAND'
	| 'LOGIC_CLOSE_NOR'
	| 'COMMENT';

export type Keyword =
	| '蹭'
	| '就是'
	| '就像'
	| '高仿'
	| '才是'
	| '抢走'
	| '好不好?'
	| '不然'
	| '玩耍'
	| '累了'
	| '想要'
	| '扒'
	| '叼回来'
	| '偷袭'
	| '好喵'
	| '坏喵'
	| '空碗'
	| '和'
	| '或'
	| '都好'
	| '有好'
	| '都坏'
	| '有坏';

export const KEYWORDS: Record<Keyword, TokenType> = {
	蹭: 'KEYWORD_USE',
	就是: 'KEYWORD_IS',
	就像: 'KEYWORD_LIKE',
	高仿: 'KEYWORD_CLONE',
	才是: 'KEYWORD_ONLY',
	抢走: 'KEYWORD_MOVE',
	'好不好?': 'KEYWORD_CONFIRM',
	不然: 'KEYWORD_ELSE',
	玩耍: 'KEYWORD_LOOP',
	累了: 'KEYWORD_BREAK',
	想要: 'KEYWORD_DEF',
	扒: 'KEYWORD_CALL',
	叼回来: 'KEYWORD_RETURN',
	偷袭: 'KEYWORD_AMBUSH',
	好喵: 'BOOLEAN',
	坏喵: 'BOOLEAN',
	空碗: 'NULL_LITERAL',
	和: 'LOGIC_AND',
	或: 'LOGIC_OR',
	都好: 'LOGIC_CLOSE_AND',
	有好: 'LOGIC_CLOSE_OR',
	都坏: 'LOGIC_CLOSE_NOR',
	有坏: 'LOGIC_CLOSE_NAND',
} as const;
export const sortedKeywords = Object.keys(KEYWORDS).sort((a, b) => b.length - a.length) as Keyword[];
export function isKeyword(symbol: string): symbol is Keyword {
	return symbol in KEYWORDS;
}

export interface Token {
	type: TokenType;
	value: string;
	line: number;
	col: number;
}

export interface TokenizerOptions {
	ignoreComments?: boolean;
	convertFullWidth?: boolean;
}

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

	while (cursor < sourceCode.length) {
		const startLine = line;
		const startCol = col;
		let char = sourceCode[cursor]!;

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
				tokens.push({ type: 'COMMENT', value: commentContent, line: commentStartLine, col: commentStartCol });
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

			if (tokenType === 'KEYWORD_DEF') expectingFuncNameAfterParamEnd = true; // '想要'
			continue;
		}

		const twoCharSymbol = sourceCode.substring(cursor, cursor + 2);
		if (['[=', '=]', '[#', '#]', '==', '>=', '<='].includes(twoCharSymbol)) {
			let type: TokenType = 'OPERATOR';
			if (twoCharSymbol === '[=') type = 'PARAM_START';
			if (twoCharSymbol === '=]') type = 'PARAM_END';
			if (twoCharSymbol === '[#') type = 'BLOCK_START';
			if (twoCharSymbol === '#]') type = 'BLOCK_END';
			tokens.push({ type, value: twoCharSymbol, line: startLine, col: startCol });
			advance(2);

			if (type !== 'PARAM_END' || !expectingFuncNameAfterParamEnd) expectingFuncNameAfterParamEnd = false;
			continue;
		}

		if ('+-*/><@~,'.includes(char)) {
			let type: TokenType = 'OPERATOR';
			if (char === ',') type = 'COMMA';
			else if (char === '@') type = 'ACCESSOR';
			else if (char === '~') type = 'TERMINATOR';
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
			tokens.push({ type: 'NUMBER', value: numStr, line: startLine, col: startCol });
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
			tokens.push({ type: 'STRING', value: str, line: startLine, col: startCol });
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
				tokens.push({ type: 'IDENTIFIER', value: identifier, line: identifierStartLine, col: identifierStartCol });
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

	tokens.push({ type: 'EOF', value: 'EndOfFile', line, col });
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
			currentToken.type === 'KEYWORD_CALL' && // 是 '扒'
			nextToken?.type === 'IDENTIFIER' && // 后面跟着一个标识符
			!(nextNextToken?.type === 'IDENTIFIER') // 后面无跟着的第二个标识符
		) {
			// 找到了一个潜在目标，例如 '扒 纸箱名函数名 ~'
			const tokenToSplit = nextToken;
			let foundSplit = false;

			for (const funcName of sortedFunctionNames) {
				// 检查这个函数名是不是标识符的后缀
				if (tokenToSplit.value.endsWith(funcName) && tokenToSplit.value.length > funcName.length) {
					// 找到了！是它喵！
					const collectionName = tokenToSplit.value.substring(0, tokenToSplit.value.length - funcName.length);

					// 1. 创建“纸箱名” Token
					const collectionToken: Token = {
						type: 'IDENTIFIER',
						value: collectionName,
						line: tokenToSplit.line,
						col: tokenToSplit.col,
					};

					// 2. 创建“函数名” Token，注意计算新的列号
					const functionToken: Token = {
						type: 'IDENTIFIER',
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
			}

			// 如果没找到匹配，说明它就是一个普通的 `扒 某个变量`，正常推入
			if (!foundSplit) {
				repairedTokens.push(currentToken);
				i++;
			}
		} else {
			// 不是需要修复的目标，或者是一个安全的 `扒 纸箱名 函数名`
			repairedTokens.push(currentToken);
			i++;
		}
	}

	return repairedTokens;
}
