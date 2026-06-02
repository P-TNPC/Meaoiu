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
	LOGIC_CLOSE_OR, // 不坏
	LOGIC_CLOSE_NOR, // 都坏
	LOGIC_CLOSE_NAND, // 不好

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
	不坏: TokenKind.LOGIC_CLOSE_OR,
	都坏: TokenKind.LOGIC_CLOSE_NOR,
	不好: TokenKind.LOGIC_CLOSE_NAND,
} as const satisfies Record<string, TokenKind>;
export type Keyword = keyof typeof KEYWORDS;
export function isKeyword(symbol: string): symbol is Keyword {
	return symbol in KEYWORDS;
}

export const sortedKeywords = Object.keys(KEYWORDS).sort((a, b) => b.length - a.length) as Keyword[];

export const OP_ARITH = new Set(['+', '-', '*', '/']);
export const OP_COMP = new Set(['==', '!=', '>', '<', '>=', '<=']);
export const OP_COMP_E = new Set(['==', '!=']);
const ID_START_REGEX = /[\p{ID_Start}_]/v;
const ID_CONTINUE_REGEX = /[\p{ID_Continue}]/v;
const isNumChar = (char: string) => char >= '0' && char <= '9';

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
	const sourceCodeLen = sourceCode.length;

	// 小本本：记函数
	const functionNames = new Set<string>(MeaoiuBuiltInNames);
	let expectingFuncNameAfterParamEnd = false;

	const tokens: Token[] = [];
	let line = OriginBase,
		col = OriginBase,
		cursor = 0;

	const charAt = (cursor: number) => String.fromCodePoint(sourceCode.codePointAt(cursor)!);
	const advance = (steps = 1) => {
		const target = cursor + steps;
		const end = Math.min(target, sourceCodeLen);
		while (cursor < end) sourceCode[cursor++] === '\n' ? (line++, (col = OriginBase)) : col++;
		cursor = target;
	};

	while (cursor < sourceCodeLen) {
		const startLine = line;
		const startCol = col;
		const char = charAt(cursor);
		const charLen = char.length; // 步进长度记好了喵！

		// 略过空白
		if (/\s/.test(char)) {
			advance(charLen);
			continue;
		}
		// 注释
		if (char === '(') {
			const contentStart = cursor + charLen;
			let nestingLevel = 1,
				i = contentStart; // 局部游标，跳过起点的 '('

			while (nestingLevel > 0 && i < sourceCodeLen) {
				const innerChar = sourceCode[i++];
				if (innerChar === '(') nestingLevel++;
				else if (innerChar === ')') nestingLevel--;
			}
			advance(i - cursor);

			if (nestingLevel !== 0) console.error('警告喵: 文件结尾有未闭合的悄悄话！');
			else i--; // 退一步，把最后的 ')' 排除在截取范围外

			if (!ignoreComments) {
				const commentContent = sourceCode.slice(contentStart, i);
				tokens.push({ kind: TokenKind.COMMENT, value: commentContent, line: startLine, col: startCol });
			}
			continue;
		}
		// 关键字
		let matchedKeyword: Keyword | undefined;
		for (const keyword of sortedKeywords) {
			if (sourceCode.startsWith(keyword, cursor)) {
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
		// 二字操作符
		if (charLen === 1 && cursor + 1 < sourceCodeLen) {
			const twoCharSymbol = char + sourceCode[cursor + 1];
			let kind: TokenKind = TokenKind.ERROR; // 默认无效值
			switch (twoCharSymbol) {
				case '==':
				case '!=':
				case '>=':
				case '<=':
					kind = TokenKind.OPERATOR;
					break;
				case '[=':
					kind = TokenKind.COLLECTION_START;
					break;
				case '=]':
					kind = TokenKind.COLLECTION_END;
					break;
				case '[#':
					kind = TokenKind.BLOCK_START;
					break;
				case '#]':
					kind = TokenKind.BLOCK_END;
					break;
			}
			if (kind !== TokenKind.ERROR) {
				tokens.push({ kind, value: twoCharSymbol, line: startLine, col: startCol });
				advance(2);
				if (kind !== TokenKind.COLLECTION_END) expectingFuncNameAfterParamEnd = false;
				continue;
			}
		}
		// 单字操作符
		if ('+-*/><@~,'.includes(char)) {
			let kind: TokenKind = TokenKind.OPERATOR;
			if (char === ',') kind = TokenKind.COMMA;
			else if (char === '@') kind = TokenKind.ACCESSOR;
			else if (char === '~') kind = TokenKind.TERMINATOR;
			tokens.push({ kind, value: char, line: startLine, col: startCol });
			advance(charLen);
			continue;
		}
		// 非负数字，十进制整数及小数
		if (isNumChar(char)) {
			let i = cursor;

			while (i < sourceCodeLen && isNumChar(sourceCode[i]!)) i++;
			if (i + 1 < sourceCodeLen && sourceCode[i] === '.' && isNumChar(sourceCode[i + 1]!)) {
				i++;
				while (i < sourceCodeLen && isNumChar(sourceCode[i]!)) i++;
			}
			const numStr = sourceCode.slice(cursor, i);
			advance(i - cursor);

			tokens.push({ kind: TokenKind.NUMBER, value: numStr, line: startLine, col: startCol });
			continue;
		}
		// 字符串
		if (char === '"' || char === "'") {
			const contentStart = cursor + charLen;
			let i = contentStart;

			while (i < sourceCodeLen && sourceCode[i] !== char) i++;
			const str = sourceCode.slice(contentStart, i);
			advance(i - cursor + charLen);

			tokens.push({ kind: TokenKind.STRING, value: str, line: startLine, col: startCol });
			continue;
		}
		// 标识符
		if (ID_START_REGEX.test(char) || char === '{') {
			let identifier = '',
				identifierStartCol = startCol,
				i = cursor;

			if (char === '{') {
				const contentStart = (i += charLen); // 跳过 '{' 并记录内容起点
				identifierStartCol += charLen; // 记录标识符真正的起始列

				while (i < sourceCodeLen && sourceCode[i] !== '}') i++;
				identifier = sourceCode.slice(contentStart, i++); // 截取标识并跳过闭合的 '}'，未闭合会多越界一步但安全
			} else {
				parseIdentifier: while (i < sourceCodeLen) {
					const idChar = charAt(i);
					if (!ID_CONTINUE_REGEX.test(idChar)) break;
					// 有粘连的关键字则打断
					for (const keyword of sortedKeywords) if (sourceCode.startsWith(keyword, i)) break parseIdentifier;
					i += idChar.length;
				}
				identifier = sourceCode.slice(cursor, i);
			}
			advance(i - cursor);

			// 统一创建标识符词元
			if (identifier) {
				tokens.push({
					kind: TokenKind.IDENTIFIER,
					value: identifier,
					line: startLine,
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

		advance(charLen);
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
	const lastIndex = tokens.length - 1;
	let i = 0;
	scanTokens: while (i < lastIndex) {
		const currentToken = tokens[i]!;
		const nextToken = tokens[i + 1]!;

		// 检查是否是需要修复的目标
		if (
			currentToken.kind !== TokenKind.KEYWORD_CALL || // 不是 '扒'
			nextToken.kind !== TokenKind.IDENTIFIER || // 后面无跟着的标识符
			tokens[i + 2]?.kind === TokenKind.IDENTIFIER // 后面跟着第二个标识符
		) {
			// 不是需要修复的目标，或者是一个安全的 `扒 纸箱名 函数名`
			repairedTokens.push(currentToken);
			i++;
			continue;
		}

		// 找到了一个潜在目标，例如 '扒 纸箱名函数名 ~'
		const { value: valueToSplit, line, col } = nextToken;

		for (const funcName of sortedFunctionNames) {
			// 检查这个函数名是不是标识符的后缀
			if (!valueToSplit.endsWith(funcName) || valueToSplit.length <= funcName.length) continue;
			// 找到了！是它喵！
			const collectionName = valueToSplit.slice(0, -funcName.length);

			// 创建 “纸箱名” 及 “函数名”
			const collectionToken: Token = { kind: TokenKind.IDENTIFIER, value: collectionName, line, col };
			const functionToken: Token = {
				kind: TokenKind.IDENTIFIER,
				value: funcName,
				line,
				col: col + collectionName.length,
			};

			// 推入修复后的版本
			repairedTokens.push(currentToken /*扒*/, collectionToken /*纸箱名*/, functionToken /*函数名*/);

			i += 2; // 跳过 '扒' 和 '纸箱名函数名' 这两个原始 Token
			continue scanTokens; // 匹配成功，检查下一组词元
		}

		// 如果没找到匹配，说明它就是一个普通的 `扒 某个变量`，正常推入
		repairedTokens.push(currentToken);
		i++;
	}
	if (i <= lastIndex) repairedTokens.push(tokens[i]!); // 补尾

	return repairedTokens;
}
