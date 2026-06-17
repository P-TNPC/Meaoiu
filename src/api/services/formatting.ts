// src/api/services/formatting.ts

import type * as AST from '../../core/ast.js';
import { NodeKind } from '../../core/ast.js';
import { isKeyword, tokenize, TokenKind } from '../../core/lexer/tokenizer.js';
import { parse, ParseMode } from '../../core/parser.js';

type FormattingOptions = {
	indentChar: string;
	level: number;
};
function indent(options: FormattingOptions): string {
	return options.indentChar.repeat(options.level);
}

function printLeadingComments(node: AST.Node, options: FormattingOptions): string {
	const comments = node.leadingComments;
	if (!comments?.length) return '';
	return comments.map(c => `${indent(options)}(${c.value})`).join('\n') + '\n';
}
function printTrailingComments(node: AST.Node): string {
	const comments = node.trailingComments;
	if (!comments?.length) return '';
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

	switch (node.kind) {
		case NodeKind.Program: {
			const body = node.body;
			const parts: string[] = [];
			for (let i = 0; i < body.length; i++) {
				const stmt = body[i]!;
				const stmtString = printNodeContent(stmt, options) + '~' + printTrailingComments(stmt);
				parts.push(stmtString);
				const nextStmt = body[i + 1];
				if (!nextStmt) continue;
				const gap = nextStmt.line - stmt.endLine - 1;
				const commentCount = nextStmt.leadingComments?.length ?? 0;
				const hasFunction =
					stmt.kind === NodeKind.FunctionDeclaration || nextStmt.kind === NodeKind.FunctionDeclaration;
				for (let eL = Math.max(gap - commentCount, +hasFunction); eL-- > 0; parts.push(''));
			}
			return parts.join('\n');
		}
		case NodeKind.BlockExpression: {
			const { isCollection, body } = node;
			if (isCollection) {
				// 是纸箱 [= ... =]
				if (body.length === 0) {
					content = '[==]';
					break;
				}
				// 纸箱元素用逗号+空格连接
				const blockContent = body.map(stmt => printNodeContent(stmt, nextLevelOptions)).join(', ');
				content = `[= ${blockContent} =]`;
			} else {
				// 是普通块 [# ... #]
				if (body.length === 0) {
					content = '[##]';
					break;
				}
				// 语句用~和换行连接
				const blockContent = body
					.map(stmt => printNodeContent(stmt, nextLevelOptions) + '~' + printTrailingComments(stmt))
					.join('\n');
				content = `[#\n${blockContent}\n${indent(options)}#]`;
			}
			break;
		}
		case NodeKind.VariableDeclaration: {
			const { initialization, identifier } = node;
			const printedContent = initialization
				? printNodeContent(initialization, { ...options, level: 0 }).trim()
				: printIdentifier(identifier);
			content = `${indent(options)}蹭 ${printedContent}`;
			break;
		}
		case NodeKind.AssignmentStatement: {
			const { operator, assignee, value } = node;
			const o =
				operator === TokenKind.ASSIGNMENT_ONLY ? '才是' : operator === TokenKind.ASSIGNMENT_LIKE ? '就像' : '就是';
			content = `${indent(options)}${printNodeContent(assignee, options)} ${o} ${printNodeContent(value, options)}`;
			break;
		}
		case NodeKind.CallExpression: {
			const { args, callee } = node;
			const argsExpr = printNodeContent(args, { ...options, level: 0 });
			const p = options.level > 0 ? indent(options) : '';
			content = `${p}扒 ${argsExpr} ${printIdentifier(callee)}`;
			break;
		}
		case NodeKind.IfExpression: {
			const { consequent, condition, alternate } = node;
			let r = `${printNodeContent(consequent, options)} 好不好? ${printNodeContent(condition, { ...options, level: 0 })}`;
			if (alternate) r += `\n${indent(options)}不然 ${printNodeContent(alternate, options)}`;
			content = `${indent(options)}${r}`;
			break;
		}
		case NodeKind.FunctionDeclaration: {
			const { parameters, name, body } = node;
			const paramsBlock = printNodeContent(parameters, options);
			content = `${indent(options)}想要 ${paramsBlock} ${printIdentifier(name)} ${printNodeContent(body, options)}`;
			break;
		}
		case NodeKind.LoopExpression: {
			content = `${indent(options)}玩耍 ${printNodeContent(node.body, options)}`;
			break;
		}
		case NodeKind.ReturnStatement: {
			const a = node.argument;
			content = `${indent(options)}叼回来${a ? ` ${printNodeContent(a, options)}` : ''}`;
			break;
		}
		case NodeKind.AmbushStatement: {
			const a = node.argument;
			content = `${indent(options)}偷袭${a ? ` ${printNodeContent(a, options)}` : ''}`;
			break;
		}
		case NodeKind.BreakStatement: {
			content = `${indent(options)}累了`;
			break;
		}
		case NodeKind.MemberAccessExpression: {
			const { object, property } = node;
			// 打印 a@b
			content = `${printNodeContent(object, options)}@${printNodeContent(property, options)}`;
			break;
		}
		case NodeKind.UnaryExpression: {
			const { operator, argument } = node;
			const op = operator === TokenKind.ASSIGNMENT_LIKE ? '高仿' : '抢走';
			content = `${op} ${printNodeContent(argument, options)}`;
			break;
		}
		case NodeKind.ArithmeticExpression: {
			const { left, operator, right } = node;
			content = `${printNodeContent(left, options)} ${operator.value} ${printNodeContent(right, options)}`;
			break;
		}
		case NodeKind.ComparisonExpression: {
			const { expressions, operators } = node;
			const parts: string[] = [];
			for (let i = 0; i < expressions.length; i++) {
				parts.push(printNodeContent(expressions[i], options));
				if (i < operators.length) parts.push(operators[i]!.value);
			}
			content = parts.join(' ');
			break;
		}
		case NodeKind.LogicalExpression: {
			const { left, operator, right } = node;
			const [o, c] = (
				{
					[TokenKind.LOGIC_CLOSE_AND]: ['和', '都好'],
					[TokenKind.LOGIC_CLOSE_OR]: ['或', '不坏'],
					[TokenKind.LOGIC_CLOSE_NOR]: ['和', '都坏'],
					[TokenKind.LOGIC_CLOSE_NAND]: ['或', '不好'],
				} as const
			)[operator];
			content = `${printNodeContent(left, options)} ${o} ${printNodeContent(right, options)} ${c}`;
			break;
		}
		case NodeKind.SequenceExpression: {
			const { sections, operators } = node;
			let s = printNodeContent(sections[0], options);
			for (let i = 0; i < operators.length; i++) {
				s += ` ${operators[i]!.value}, ${printNodeContent(sections[i + 1], options)}`;
			}
			content = s;
			break;
		}
		case NodeKind.Identifier:
			content = printIdentifier(node);
			break;
		case NodeKind.NumericLiteral:
			content = String(node.value);
			break;
		case NodeKind.StringLiteral: {
			const v = node.value;
			content = v.includes("'") ? `"${v}"` : `'${v}'`;
			break;
		}
		case NodeKind.BooleanLiteral:
			content = node.value ? '好喵' : '坏喵';
			break;
		case NodeKind.NullLiteral:
			content = '空碗';
			break;
		case NodeKind.ErrorNode:
			content = `(喵！解析错误: ${node.message})`;
			break;
		case NodeKind.ExpressionStatement: {
			content = printNodeContent(node.expression, options);
			break;
		}
		default: // 此处已推断为不可达
			const _n: never = node;
			console.warn(`[格式化器] 目前无法整理此类节点 `, _n);
	}

	return leading + content;
}

export function getFormattedCode(sourceCode: string): string {
	const ast = parse(tokenize(sourceCode, { ignoreComments: false }), ParseMode.TOLERANT).program;
	const options: FormattingOptions = { indentChar: '\t', level: 0 };
	return printNodeContent(ast, options);
}
