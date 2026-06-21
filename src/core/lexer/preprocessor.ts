// src/core/lexer/preprocessor.ts

const nonAsciiMap: Record<string, string> = {
	// 数字
	'０': '0',
	'１': '1',
	'２': '2',
	'３': '3',
	'４': '4',
	'５': '5',
	'６': '6',
	'７': '7',
	'８': '8',
	'９': '9',

	// 大写字母
	Ａ: 'A',
	Ｂ: 'B',
	Ｃ: 'C',
	Ｄ: 'D',
	Ｅ: 'E',
	Ｆ: 'F',
	Ｇ: 'G',
	Ｈ: 'H',
	Ｉ: 'I',
	Ｊ: 'J',
	Ｋ: 'K',
	Ｌ: 'L',
	Ｍ: 'M',
	Ｎ: 'N',
	Ｏ: 'O',
	Ｐ: 'P',
	Ｑ: 'Q',
	Ｒ: 'R',
	Ｓ: 'S',
	Ｔ: 'T',
	Ｕ: 'U',
	Ｖ: 'V',
	Ｗ: 'W',
	Ｘ: 'X',
	Ｙ: 'Y',
	Ｚ: 'Z',

	// 小写字母
	ａ: 'a',
	ｂ: 'b',
	ｃ: 'c',
	ｄ: 'd',
	ｅ: 'e',
	ｆ: 'f',
	ｇ: 'g',
	ｈ: 'h',
	ｉ: 'i',
	ｊ: 'j',
	ｋ: 'k',
	ｌ: 'l',
	ｍ: 'm',
	ｎ: 'n',
	ｏ: 'o',
	ｐ: 'p',
	ｑ: 'q',
	ｒ: 'r',
	ｓ: 's',
	ｔ: 't',
	ｕ: 'u',
	ｖ: 'v',
	ｗ: 'w',
	ｘ: 'x',
	ｙ: 'y',
	ｚ: 'z',

	// 标点符号
	'！': '!',
	'＂': '"',
	'＃': '#',
	'＄': '$',
	'％': '%',
	'＆': '&',
	'＇': "'",
	'（': '(',
	'）': ')',
	'＊': '*',
	'＋': '+',
	'，': ',',
	'－': '-',
	'．': '.',
	'／': '/',
	'：': ':',
	'；': ';',
	'＜': '<',
	'＝': '=',
	'＞': '>',
	'？': '?',
	'＠': '@',
	'［': '[',
	'＼': '\\',
	'］': ']',
	'＾': '^',
	'＿': '_',
	'｀': '`',
	'｛': '{',
	'｜': '|',
	'｝': '}',
	'～': '~',
	'　': ' ',

	// 常见中文排版符号
	'【': '[',
	'】': ']',
	'「': "'",
	'」': "'",
	'『': '"',
	'』': '"',
	'《': '<',
	'》': '>',
	'〈': '<',
	'〉': '>',
	'。': '.',
	'、': ',',
	'‘': "'",
	'’': "'",
	'“': '"',
	'”': '"',
};

export function preprocess(sourceCode: string): string {
	let result = '';
	const sourceCodeLen = sourceCode.length;

	let prevStart = 0;
	for (let cursor = 0, prevEnd = 0, closeChar = ''; cursor < sourceCodeLen; prevEnd = ++cursor) {
		const openChar = nonAsciiMap[(closeChar = sourceCode[cursor]!)] ?? closeChar;

		convert: switch (openChar) {
			case "'":
			case '"':
			case '{':
				for (const closing = openChar === '{' ? '}' : openChar; ++cursor < sourceCodeLen; ) {
					if ((closeChar = nonAsciiMap[(closeChar = sourceCode[cursor]!)] ?? closeChar) === closing) break convert;
				}
				closeChar = '';
				break;
			case '(':
				for (let nestingLevel = 1; ++cursor < sourceCodeLen; ) {
					closeChar = nonAsciiMap[(closeChar = sourceCode[cursor]!)] ?? closeChar;
					if (closeChar === '(') nestingLevel++;
					else if (closeChar === ')' && --nestingLevel === 0) break convert;
				}
				closeChar = '';
				break;
			default:
				if (openChar === closeChar) continue;
				result += `${sourceCode.slice(prevStart, cursor)}${openChar}`;
				prevStart = cursor + 1;
				continue;
		}

		result += `${sourceCode.slice(prevStart, prevEnd)}${openChar}${sourceCode.slice(prevEnd + 1, cursor)}${closeChar}`;
		prevStart = cursor + 1;
	}
	if (prevStart < sourceCodeLen) result += sourceCode.slice(prevStart);

	return result;
}
