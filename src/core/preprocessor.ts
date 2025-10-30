// src/core/preprocessor.ts

const fullWidthMap: Record<string, string> = {
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

type State = 'DEFAULT' | 'IN_SINGLE_QUOTE' | 'IN_DOUBLE_QUOTE' | 'IN_COMMENT';

export function preprocess(sourceCode: string): string {
	let result = '';
	let state: State = 'DEFAULT';
	let commentNesting = 0;

	for (let i = 0; i < sourceCode.length; i++) {
		const char = sourceCode[i]!;
		const convertedChar = fullWidthMap[char] ?? char;

		switch (state) {
			case 'DEFAULT': {
				// 根据转换后的字符来判断状态切换
				if (convertedChar === "'") {
					state = 'IN_SINGLE_QUOTE';
				} else if (convertedChar === '"') {
					state = 'IN_DOUBLE_QUOTE';
				} else if (convertedChar === '(') {
					state = 'IN_COMMENT';
					commentNesting = 1;
				}

				// 在 DEFAULT 状态下，总是添加转换后的字符
				result += convertedChar;
				break;
			}

			case 'IN_SINGLE_QUOTE': {
				if (convertedChar === "'") {
					state = 'DEFAULT';
					result += convertedChar; // 统一输出半宽
				} else {
					result += char; // 内部字符原样输出
				}
				break;
			}

			case 'IN_DOUBLE_QUOTE': {
				if (convertedChar === '"') {
					state = 'DEFAULT';
					result += convertedChar; // 统一输出半宽
				} else {
					result += char; // 内部字符原样输出
				}
				break;
			}

			case 'IN_COMMENT': {
				if (convertedChar === '(') {
					commentNesting++;
				} else if (convertedChar === ')') {
					commentNesting--;
				}

				if (commentNesting === 0) {
					state = 'DEFAULT';
					result += convertedChar; // 统一输出半宽
				} else {
					result += char; // 内部字符原样输出
				}
				break;
			}
		}
	}
	return result;
}
