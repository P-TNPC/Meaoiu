// src/core/lexer/tokenizer.ts

import { preprocess } from './preprocessor.js';
import { builtInNameSet } from '../builtIns.js';

export const enum TokenKind {
	ERROR, //不认识的字符喵

	// 关键字
	KEYWORD_USE,
	ASSIGNMENT_IS,
	ASSIGNMENT_LIKE,
	ASSIGNMENT_ONLY,
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
	// 操作符 +, -, *, /, ==, !=, >, <, >=, <=
	ARITHMETIC_PLUS, // +
	ARITHMETIC_MINUS, // -
	ARITHMETIC_MULTIPLY, // *
	ARITHMETIC_DIVIDE, // /
	COMPARISON_EQUAL, // ==
	COMPARISON_NOT_EQUAL, // !=
	COMPARISON_GREATER, // >
	COMPARISON_LESS, // <
	COMPARISON_GREATER_EQUAL, // >=
	COMPARISON_LESS_EQUAL, // <=
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

type AdditiveTokenKind = TokenKind.ARITHMETIC_PLUS | TokenKind.ARITHMETIC_MINUS;
type MultiplicativeTokenKind = TokenKind.ARITHMETIC_MULTIPLY | TokenKind.ARITHMETIC_DIVIDE;
export type ArithmeticTokenKind = AdditiveTokenKind | MultiplicativeTokenKind;
export type EqualityTokenKind = TokenKind.COMPARISON_EQUAL | TokenKind.COMPARISON_NOT_EQUAL;
type OrderingTokenKind =
	| TokenKind.COMPARISON_GREATER
	| TokenKind.COMPARISON_LESS
	| TokenKind.COMPARISON_GREATER_EQUAL
	| TokenKind.COMPARISON_LESS_EQUAL;
export type ComparisonTokenKind = EqualityTokenKind | OrderingTokenKind;
// type OperatorTokenKind = ArithmeticTokenKind | ComparisonTokenKind;

type TokenValueMap = {
	[TokenKind.ARITHMETIC_PLUS]: '+';
	[TokenKind.ARITHMETIC_MINUS]: '-';
	[TokenKind.ARITHMETIC_MULTIPLY]: '*';
	[TokenKind.ARITHMETIC_DIVIDE]: '/';
	[TokenKind.COMPARISON_EQUAL]: '==';
	[TokenKind.COMPARISON_NOT_EQUAL]: '!=';
	[TokenKind.COMPARISON_GREATER]: '>';
	[TokenKind.COMPARISON_LESS]: '<';
	[TokenKind.COMPARISON_GREATER_EQUAL]: '>=';
	[TokenKind.COMPARISON_LESS_EQUAL]: '<=';
};

type TokenUnion = {
	[K in TokenKind]: {
		kind: K;
		value: K extends keyof TokenValueMap ? TokenValueMap[K] : string;
		line: number;
		col: number;
		endLine: number;
		endCol: number; // 尾开区间
	};
}[TokenKind];
export type Token<K extends TokenKind = TokenKind> = Extract<TokenUnion, { kind: K }>;
export function newToken<K extends TokenKind>(
	kind: K,
	value: K extends keyof TokenValueMap ? TokenValueMap[K] : string,
	startLine: number,
	startCol: number,
	endLine: number,
	endCol: number,
): Token<K> {
	return { kind, value, line: startLine, col: startCol, endLine, endCol } as unknown as Token<K>;
}

const KEYWORDS = {
	蹭: TokenKind.KEYWORD_USE,
	就是: TokenKind.ASSIGNMENT_IS,
	就像: TokenKind.ASSIGNMENT_LIKE,
	高仿: TokenKind.KEYWORD_CLONE,
	才是: TokenKind.ASSIGNMENT_ONLY,
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
export const isKeyword = (symbol: string): symbol is Keyword => symbol in KEYWORDS;
export const sortedKeywords = Object.keys(KEYWORDS).sort((a, b) => b.length - a.length) as Keyword[];

const ID_START_REGEX = /[\p{ID_Start}_]/v;
const ID_CONTINUE_REGEX = /[\p{ID_Continue}]/v;
const isNumChar = (char: string) => char >= '0' && char <= '9';

export type TokenizerOptions = {
	ignoreComments?: boolean;
	convertNonAscii?: boolean;
	useOnebased?: boolean;
};

const enum FuncDefState {
	NOT_DEF = 0,
	PASS_PARAM,
	GET_NAME,
}
const enum FuncCallState {
	OK = 0,
	SEEK_PARAM = -1,
	SEEKING_PARAM = 0,
	SEEK_NAME = -3,
	SEEKING_NAME = -2,
	MISSED = -2,
	PASSED = 1,
}

export function tokenize(sourceCode: string, options?: TokenizerOptions): Token[] {
	const { ignoreComments = true, convertNonAscii = true, useOnebased = true } = options ?? {};
	if (convertNonAscii) sourceCode = preprocess(sourceCode);
	const sourceCodeLen = sourceCode.length;
	const OriginBase = +useOnebased;

	const tokens: Token[] = [];
	let line = OriginBase,
		col = OriginBase,
		cursor = 0;

	const charAt = (cursor: number) => String.fromCodePoint(sourceCode.codePointAt(cursor)!);
	const advance = (steps: number) => {
		const target = cursor + steps;
		const end = Math.min(target, sourceCodeLen);
		while (cursor < end) sourceCode[cursor++] === '\n' ? (line++, (col = OriginBase)) : col++;
		cursor = target;
	};

	const functionNames = new Set<string>(builtInNameSet); // 小本本：记函数
	const susIdIndexes: number[] = []; // 嫌疑标识符名单
	let funcCallState = FuncCallState.OK; // 自然衰变的神奇喵喵标签
	scanSourceCode: for (
		let funcDefState = FuncDefState.NOT_DEF;
		cursor < sourceCodeLen;
		funcCallState++ === FuncCallState.MISSED
			? (susIdIndexes.push(tokens.length - 2), (funcCallState = FuncCallState.PASSED))
			: 0
	) {
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
				tokens.push(newToken(TokenKind.COMMENT, commentContent, startLine, startCol, line, col));
			}
			continue;
		}
		// 关键字
		for (const keyword of sortedKeywords) {
			if (!sourceCode.startsWith(keyword, cursor)) continue;

			const tokenKind = KEYWORDS[keyword];

			advance(keyword.length);
			tokens.push(newToken(tokenKind, keyword, startLine, startCol, line, col));

			if (tokenKind === TokenKind.KEYWORD_DEF) funcDefState = FuncDefState.PASS_PARAM;
			else if (tokenKind === TokenKind.KEYWORD_CALL) funcCallState = FuncCallState.SEEK_PARAM;
			continue scanSourceCode;
		}
		// 二字原子
		doubleCharAtomic: if (cursor + 1 < sourceCodeLen) {
			const twoCharSymbol = char + sourceCode[cursor + 1];
			let kind: TokenKind = TokenKind.ERROR; // 默认无效值
			switch (twoCharSymbol) {
				case '==':
					kind = TokenKind.COMPARISON_EQUAL;
					break;
				case '!=':
					kind = TokenKind.COMPARISON_NOT_EQUAL;
					break;
				case '>=':
					kind = TokenKind.COMPARISON_GREATER_EQUAL;
					break;
				case '<=':
					kind = TokenKind.COMPARISON_LESS_EQUAL;
					break;
				case '[=':
					kind = TokenKind.COLLECTION_START;
					break;
				case '=]':
					kind = TokenKind.COLLECTION_END;
					funcDefState &&= FuncDefState.GET_NAME;
					break;
				case '[#':
					kind = TokenKind.BLOCK_START;
					break;
				case '#]':
					kind = TokenKind.BLOCK_END;
					break;
				default:
					break doubleCharAtomic;
			}
			advance(2);
			tokens.push(newToken(kind, twoCharSymbol, startLine, startCol, line, col));
			continue;
		}
		// 单字原子
		singleCharAtomic: {
			let kind: TokenKind = TokenKind.ERROR;
			switch (char) {
				case '+':
					kind = TokenKind.ARITHMETIC_PLUS;
					break;
				case '-':
					kind = TokenKind.ARITHMETIC_MINUS;
					break;
				case '*':
					kind = TokenKind.ARITHMETIC_MULTIPLY;
					break;
				case '/':
					kind = TokenKind.ARITHMETIC_DIVIDE;
					break;
				case '>':
					kind = TokenKind.COMPARISON_GREATER;
					break;
				case '<':
					kind = TokenKind.COMPARISON_LESS;
					break;
				case ',':
					kind = TokenKind.COMMA;
					break;
				case '@':
					kind = TokenKind.ACCESSOR;
					break;
				case '~':
					kind = TokenKind.TERMINATOR;
					if (funcDefState === FuncDefState.GET_NAME) funcDefState = FuncDefState.NOT_DEF;
					break;
				default:
					break singleCharAtomic;
			}
			advance(1);
			tokens.push(newToken(kind, char, startLine, startCol, line, col));
			continue;
		}
		// 非负数字，十进制整数及小数
		if (isNumChar(char)) {
			let i = cursor;

			while (i < sourceCodeLen && isNumChar(sourceCode[i]!)) i++;
			if (i + 1 < sourceCodeLen && sourceCode[i] === '.' && isNumChar(sourceCode[i + 1]!)) {
				for (i++; i < sourceCodeLen && isNumChar(sourceCode[i]!); i++);
			}
			const numStr = sourceCode.slice(cursor, i);
			advance(i - cursor);

			tokens.push(newToken(TokenKind.NUMBER, numStr, startLine, startCol, line, col));
			continue;
		}
		// 字符串
		if (char === '"' || char === "'") {
			const contentStart = cursor + charLen;
			let i = contentStart;

			while (i < sourceCodeLen && sourceCode[i] !== char) i++;
			const str = sourceCode.slice(contentStart, i);
			advance(i - cursor + charLen);

			tokens.push(newToken(TokenKind.STRING, str, startLine, startCol, line, col));
			continue;
		}
		// 标识符
		const isCurlyIdentifier = char === '{';
		if (isCurlyIdentifier || ID_START_REGEX.test(char)) {
			let identifierStartCol = startCol,
				contentStart = cursor,
				i = cursor;

			scanId: if (isCurlyIdentifier) {
				funcCallState = FuncCallState.OK;
				contentStart = i += charLen; // 跳过 '{' 并记录内容起点
				identifierStartCol += charLen; // 记录标识符真正的起始列

				while (i < sourceCodeLen && sourceCode[i] !== '}') i++;
				if (i !== contentStart) break scanId;
				// 空白则记录错误并跳出
				advance(2); // 跳过一对 '{}'
				tokens.push(newToken(TokenKind.ERROR, sourceCode.slice(i - 1, i + 1), startLine, startCol, line, col));
				continue;
			} else {
				if (funcCallState === FuncCallState.SEEKING_PARAM) funcCallState = FuncCallState.SEEK_NAME;
				else if (funcCallState === FuncCallState.SEEKING_NAME) funcCallState = FuncCallState.OK;

				while (i < sourceCodeLen) {
					const idChar = charAt(i);
					if (!ID_CONTINUE_REGEX.test(idChar)) break;
					for (const keyword of sortedKeywords) if (sourceCode.startsWith(keyword, i)) break scanId; // 有粘连的关键字则打断
					i += idChar.length;
				}
			}
			advance(i - cursor);

			// 统一创建标识符词元
			const identifier = sourceCode.slice(contentStart, i); // 截取标识
			tokens.push(newToken(TokenKind.IDENTIFIER, identifier, startLine, identifierStartCol, line, col));
			if (isCurlyIdentifier) advance(1); // 跳过闭合的 '}'

			if (funcDefState === FuncDefState.GET_NAME) {
				functionNames.add(identifier); // 抓到了！这个标识符就是函数名喵！
				funcDefState = FuncDefState.NOT_DEF; // 重置状态
			}
			continue;
		}

		// 不认识的字符喵
		advance(charLen);
		tokens.push(newToken(TokenKind.ERROR, char, startLine, startCol, line, col));
		console.error('不认识的字符喵:', char);
	}
	if (funcCallState === FuncCallState.MISSED) susIdIndexes.push(tokens.length - 1); // 补尾

	tokens.push(newToken(TokenKind.EOF, 'EndOfFile', line, col, line, col));
	return susIdIndexes.length ? repairCallTokens(tokens, functionNames, susIdIndexes) : tokens;
}

/**
 * 遍历原始 Token 列表，修复被错误合并的 `扒纸箱名函数名`。
 */
function repairCallTokens(tokens: Token[], functionNames: Set<string>, indexesToSplit: number[]): Token[] {
	// 按长度降序排序，确保 `喵` 不会错误地匹配 `xxx高级喵` 的 `喵`
	const sortedFunctionNames = Array.from(functionNames).sort((a, b) => b.length - a.length);

	const repairedTokens: Token[] = [];
	scanTokens: for (let i = 0, j = 0, indexToSplit = indexesToSplit[j]; i < tokens.length; i++) {
		const currentToken = tokens[i]!;
		// 检查是否是需要修复的目标
		if (i !== indexToSplit) {
			repairedTokens.push(currentToken);
			continue;
		}
		indexToSplit = indexesToSplit[Math.min(++j, indexesToSplit.length - 1)];

		// 匹配潜在目标
		const { value: valueToSplit, line, col, endLine, endCol } = currentToken;
		for (const funcName of sortedFunctionNames) {
			// 检查这个函数名是不是标识符的后缀
			if (valueToSplit.length <= funcName.length || !valueToSplit.endsWith(funcName)) continue;
			// 找到了！是它喵！
			const collectionName = valueToSplit.slice(0, -funcName.length);
			const splitCol = col + collectionName.length;

			// 创建 “纸箱名” 及 “函数名”
			const collectionToken = newToken(TokenKind.IDENTIFIER, collectionName, line, col, line, splitCol);
			const functionToken = newToken(TokenKind.IDENTIFIER, funcName, line, splitCol, endLine, endCol);

			// 推入修复后的版本
			repairedTokens.push(collectionToken /*纸箱名*/, functionToken /*函数名*/);

			continue scanTokens; // 匹配成功，检查下一组词元
		}

		// 无匹配关键字，照常推入
		repairedTokens.push(currentToken);
	}

	return repairedTokens;
}
