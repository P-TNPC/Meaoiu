// src/core/tokenizer.ts

export type TokenType =
	| 'KEYWORD_USE'
	| 'KEYWORD_IS'
	| 'KEYWORD_LIKE'
	| 'KEYWORD_CONFIRM'
	| 'KEYWORD_ELSE'
	| 'KEYWORD_LOOP'
	| 'KEYWORD_BREAK'
	| 'KEYWORD_DEF'
	| 'KEYWORD_CALL'
	| 'KEYWORD_RETURN'
	| 'KEYWORD_CLONE'
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
	| 'MATCH'
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

export interface Token {
	type: TokenType;
	value: string;
	line: number; // 新增：行号
	col: number; // 新增：列号
}

export const KEYWORDS: Record<string, TokenType> = {
	蹭: 'KEYWORD_USE',
	就是: 'KEYWORD_IS',
	就像: 'KEYWORD_LIKE',
	'好不好?': 'KEYWORD_CONFIRM',
	不然: 'KEYWORD_ELSE',
	玩耍: 'KEYWORD_LOOP',
	累了: 'KEYWORD_BREAK',
	想要: 'KEYWORD_DEF',
	扒: 'KEYWORD_CALL',
	叼回来: 'KEYWORD_RETURN',
	高仿: 'KEYWORD_CLONE',
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

export interface TokenizerOptions {
	ignoreComments?: boolean;
}

export function tokenize(sourceCode: string, options: TokenizerOptions): Token[] {
	const tokens: Token[] = [];
	let line = 1;
	let col = 1;
	let cursor = 0;
	const sortedKeywords = Object.keys(KEYWORDS).sort((a, b) => b.length - a.length);

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

				if (nestingLevel > 0) {
					commentContent += char;
				}
				advance();
			}

			if (nestingLevel !== 0) console.error('警告喵: 文件结尾有未闭合的悄悄话！');

			// THE NEW LOGIC: Only push COMMENT token if not ignored
			if (!options?.ignoreComments) {
				tokens.push({ type: 'COMMENT', value: commentContent, line: commentStartLine, col: commentStartCol });
			}
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
			continue;
		}

		if ('+-*/><@~,'.includes(char)) {
			let type: TokenType = 'OPERATOR';
			if (char === ',') type = 'COMMA';
			else if (char === '@') type = 'MATCH';
			else if (char === '~') type = 'TERMINATOR';
			tokens.push({ type, value: char, line: startLine, col: startCol });
			advance();
			continue;
		}

		// Check for keywords and literals that are not identifiers
		const remainingCode = sourceCode.substring(cursor);
		let matchedKeyword = '';
		for (const keyword of sortedKeywords) {
			if (remainingCode.startsWith(keyword)) {
				matchedKeyword = keyword;
				break;
			}
		}
		if (matchedKeyword) {
			tokens.push({ type: KEYWORDS[matchedKeyword]!, value: matchedKeyword, line: startLine, col: startCol });
			advance(matchedKeyword.length);
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
					identifier += sourceCode[cursor]!;
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
					if (isKeywordAhead) {
						break;
					}
					identifier += sourceCode[cursor]!;
					advance();
				}
			}

			// 最后，统一创建 Token
			if (identifier) {
				tokens.push({ type: 'IDENTIFIER', value: identifier, line: identifierStartLine!, col: identifierStartCol! });
			}
			continue;
		}

		console.error('不认识的字符喵:', char);
		advance();
	}

	tokens.push({ type: 'EOF', value: 'EndOfFile', line, col });
	return tokens;
}
