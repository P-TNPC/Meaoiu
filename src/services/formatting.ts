// src/services/formatting.ts

import type * as AST from '../core/ast.js';
import { tokenize, isKeyword } from '../core/tokenizer.js';
import { Parser } from '../core/parser.js';

interface FormattingOptions {
	indentChar: string;
	level: number;
}
function indent(options: FormattingOptions): string {
	return options.indentChar.repeat(options.level);
}

function printLeadingComments(node: AST.Node, options: FormattingOptions): string {
	const comments = node.leadingComments;
	if (!comments || comments.length === 0) return '';
	return comments.map(c => `${indent(options)}(${c.value})`).join('\n') + '\n';
}
function printTrailingComments(node: AST.Node): string {
	const comments = node.trailingComments;
	if (!comments || comments.length === 0) return '';
	return ' ' + comments.map(c => `(${c.value})`).join(' ');
}

function printIdentifier(node: AST.Identifier): string {
	const symbol = node.symbol;
	if (isKeyword(symbol)) return `{${symbol}}`;
	return symbol;
}

function printNodeContent(node: AST.Node | undefined, options: FormattingOptions): string {
	if (!node) return '';
	const nextLevelOptions = { ...options, level: options.level + 1 };

	const leading = printLeadingComments(node, options);

	let content = '';

	switch (node.type) {
		case 'Program': {
			const body = node.body;
			const parts: string[] = [];
			for (let i = 0; i < body.length; i++) {
				const stmt = body[i]!;
				const stmtString = printNodeContent(stmt, options) + '~' + printTrailingComments(stmt);
				parts.push(stmtString);
				const nextStmt = body[i + 1];
				if (nextStmt) {
					const gap = nextStmt.line && stmt.endLine ? nextStmt.line - stmt.endLine - 1 : 0;
					const commentCount = nextStmt.leadingComments?.length ?? 0;
					const hasFunction = stmt.type === 'FunctionDeclaration' || nextStmt.type === 'FunctionDeclaration';
					const eL = Math.max(gap - commentCount, hasFunction ? 1 : 0);
					if (eL > 0) parts.push(...Array(eL).fill(''));
				}
			}
			return parts.join('\n');
		}
		case 'BlockStatement': {
			const n = node;
			if (n.isCollection) {
				// 是纸箱 [= ... =]
				if (n.body.length === 0) {
					content = '[==]';
					break;
				}
				// 纸箱元素用逗号+空格连接
				const blockContent = n.body
					.map(stmt => indent(nextLevelOptions) + printNodeContent(stmt, nextLevelOptions))
					.join(',\n');
				content = `[=\n${blockContent}\n${indent(options)}=]`;
			} else {
				// 是普通块 [# ... #]
				if (n.body.length === 0) {
					content = '[##]';
					break;
				}
				// 语句用~和换行连接
				const blockContent = n.body
					.map(stmt => printNodeContent(stmt, nextLevelOptions) + '~' + printTrailingComments(stmt))
					.join('\n');
				content = `[#\n${blockContent}\n${indent(options)}#]`;
			}
			break;
		}

		case 'VariableDeclaration': {
			const n = node;
			if (n.initialization) {
				// 复用 AssignmentStatement 的打印逻辑
				const assignContent = printNodeContent(n.initialization, { ...options, level: 0 }).trim();
				content = `${indent(options)}蹭 ${assignContent}`;
			} else {
				content = `${indent(options)}蹭 ${printIdentifier(n.identifier)}`;
			}
			break;
		}
		case 'AssignmentStatement': {
			const n = node;
			const k = n.kind === 'Move' ? '才是' : n.kind === 'Copy' ? '就像' : '就是';
			content = `${indent(options)}${printNodeContent(n.assignee, options)} ${k} ${printNodeContent(n.value, options)}`;
			break;
		}
		case 'CallExpression': {
			const n = node;
			const argsExpr = printNodeContent(n.args, { ...options, level: 0 });
			const p = options.level > 0 ? indent(options) : '';
			content = `${p}扒 ${argsExpr} ${printIdentifier(n.callee)}`;
			break;
		}
		case 'IfStatement': {
			const n = node;
			let r = `${printNodeContent(n.consequent, options)} 好不好? ${printNodeContent(n.test, { ...options, level: 0 })}`;
			if (n.alternate) r += `\n${indent(options)}不然 ${printNodeContent(n.alternate, options)}`;
			content = `${indent(options)}${r}`;
			break;
		}
		case 'FunctionDeclaration': {
			const n = node;
			const paramsBlock = printNodeContent(n.params, options);
			content = `${indent(options)}想要 ${paramsBlock} ${printIdentifier(n.name)} ${printNodeContent(n.body, options)}`;
			break;
		}
		case 'LoopStatement': {
			content = `${indent(options)}玩耍 ${printNodeContent(node.body, options)}`;
			break;
		}
		case 'ReturnStatement': {
			const a = node.argument;
			content = `${indent(options)}叼回来${a ? ` ${printNodeContent(a, options)}` : ''}`;
			break;
		}
		case 'AmbushStatement': {
			const a = node.argument;
			content = `${indent(options)}偷袭${a ? ` ${printNodeContent(a, options)}` : ''}`;
			break;
		}
		case 'BreakStatement': {
			content = `${indent(options)}累了`;
			break;
		}
		case 'MemberAccessExpression': {
			const n = node;
			// 打印 a@b
			content = `${printNodeContent(n.object, options)}@${printNodeContent(n.property, options)}`;
			break;
		}
		case 'UnaryExpression': {
			const n = node;
			const op = n.operator === 'Copy' ? '高仿' : '抢走';
			content = `${op} ${printNodeContent(n.argument, options)}`;
			break;
		}
		case 'BinaryExpression': {
			const n = node;
			content = `${printNodeContent(n.left, options)} ${n.operator} ${printNodeContent(n.right, options)}`;
			break;
		}
		case 'LogicalExpression': {
			const n = node;
			const o = { AND: '和', OR: '或', NOR: '和', NAND: '或' };
			const c = { AND: '都好', OR: '有好', NOR: '都坏', NAND: '有坏' };
			content = `${printNodeContent(n.left, options)} ${o[n.operator]} ${printNodeContent(n.right, options)} ${
				c[n.operator]
			}`;
			break;
		}
		case 'SequenceExpression': {
			const n = node;
			let s = printNodeContent(n.sections[0]!, options);
			for (let i = 0; i < n.operators.length; i++) {
				s += ` ${n.operators[i]!.value}, ${printNodeContent(n.sections[i + 1]!, options)}`;
			}
			content = s;
			break;
		}
		case 'Identifier':
			content = printIdentifier(node);
			break;
		case 'NumericLiteral':
			content = String(node.value);
			break;
		case 'StringLiteral': {
			const v = node.value;
			content = v.includes("'") ? `"${v}"` : `'${v}'`;
			break;
		}
		case 'BooleanLiteral':
			content = node.value ? '好喵' : '坏喵';
			break;
		case 'NullLiteral':
			content = '空碗';
			break;
		case 'ErrorNode':
			content = `(喵！解析错误: ${node.message})`;
			break;
		case 'ExpressionStatement': {
			const n = node;
			content = printNodeContent(n.expression, options);
			break;
		}
		default: // 此处已推断为不可达
			console.warn(`[格式化器] 目前无法整理此类节点: `, node);
			content = '';
	}

	return leading + content;
}

export function getFormattedCode(sourceCode: string): string {
	const options: FormattingOptions = { indentChar: '\t', level: 0 };
	const parser = new Parser(tokenize(sourceCode, { ignoreComments: false }), 'tolerant');
	const { program: ast } = parser.parse();
	return printNodeContent(ast, options);
}
