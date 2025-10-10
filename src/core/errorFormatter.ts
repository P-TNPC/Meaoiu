// src/errorFormatter.ts
import * as path from 'path';
import stringWidth from 'string-width';

export function formatError(error: Error, sourceCode: string, filePath: string): string {
    const message = error.message;

    const match = message.match(/\[(\d+):(\d+)\]/);
    if (!match) {
        return `坏了喵: ${message}`;
    }

    const [, lineStr, colStr] = match;
    const line = parseInt(lineStr!, 10);
    const col = parseInt(colStr!, 10);

    const lines = sourceCode.split('\n');
    const errorLine = lines[line - 1];
    if (errorLine === undefined) {
        return `坏了喵: ${message} (找不到秘卷第 ${line} 行)`;
    }

    const prefix = errorLine.substring(0, col - 1);
    const prefixWidth = stringWidth(prefix);
    const indicator = ' '.repeat(prefixWidth) + '^';

    const fileName = path.basename(filePath);
    const formattedMessage = [
        `\n💥 坏了喵！💥`,
        `${message}`,
        ``,
        `--> ${fileName}:${line}:${col}`,
        `   |`,
        `${String(line).padStart(3, ' ')}| ${errorLine}`,
        `   | ${indicator}`,
        ``
    ].join('\n');

    return formattedMessage;
}