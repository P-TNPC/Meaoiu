// src/services/formatting.ts

import type * as AST from '../core/ast.js';
import { AssignmentKind, LogicalOperator, NodeType } from '../core/ast.js';
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

	switch (node.type) {
		case NodeType.Program: {
			const body = node.body;
			const parts: string[] = [];
			for (let i = 0; i < body.length; i++) {
				const stmt = body[i]!;
				const stmtString = printNodeContent(stmt, options) + '~' + printTrailingComments(stmt);
				parts.push(stmtString);
				const nextStmt = body[i + 1];
				if (nextStmt) {
					const gap = nextStmt.line - stmt.endLine - 1;
					const commentCount = nextStmt.leadingComments?.length ?? 0;
					const hasFunction =
						stmt.type === NodeType.FunctionDeclaration || nextStmt.type === NodeType.FunctionDeclaration;
					const eL = Math.max(gap - commentCount, +hasFunction);
					if (eL > 0) parts.push(...Array(eL).fill(''));
				}
			}
			return parts.join('\n');
		}
		case NodeType.BlockStatement: {
			const n = node;
			if (n.isCollection) {
				// 是纸箱 [= ... =]
				if (n.body.length === 0) {
					content = '[==]';
					break;
				}
				// 纸箱元素用逗号+空格连接
				const blockContent = n.body.map(stmt => printNodeContent(stmt, nextLevelOptions)).join(', ');
				content = `[= ${blockContent} =]`;
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
		case NodeType.VariableDeclaration: {
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
		case NodeType.AssignmentStatement: {
			const n = node;
			const k = n.kind === AssignmentKind.MOVE ? '才是' : n.kind === AssignmentKind.COPY ? '就像' : '就是';
			content = `${indent(options)}${printNodeContent(n.assignee, options)} ${k} ${printNodeContent(n.value, options)}`;
			break;
		}
		case NodeType.CallExpression: {
			const n = node;
			const argsExpr = printNodeContent(n.args, { ...options, level: 0 });
			const p = options.level > 0 ? indent(options) : '';
			content = `${p}扒 ${argsExpr} ${printIdentifier(n.callee)}`;
			break;
		}
		case NodeType.IfStatement: {
			const n = node;
			let r = `${printNodeContent(n.consequent, options)} 好不好? ${printNodeContent(n.test, { ...options, level: 0 })}`;
			if (n.alternate) r += `\n${indent(options)}不然 ${printNodeContent(n.alternate, options)}`;
			content = `${indent(options)}${r}`;
			break;
		}
		case NodeType.FunctionDeclaration: {
			const n = node;
			const paramsBlock = printNodeContent(n.params, options);
			content = `${indent(options)}想要 ${paramsBlock} ${printIdentifier(n.name)} ${printNodeContent(n.body, options)}`;
			break;
		}
		case NodeType.LoopStatement: {
			content = `${indent(options)}玩耍 ${printNodeContent(node.body, options)}`;
			break;
		}
		case NodeType.ReturnStatement: {
			const a = node.argument;
			content = `${indent(options)}叼回来${a ? ` ${printNodeContent(a, options)}` : ''}`;
			break;
		}
		case NodeType.AmbushStatement: {
			const a = node.argument;
			content = `${indent(options)}偷袭${a ? ` ${printNodeContent(a, options)}` : ''}`;
			break;
		}
		case NodeType.BreakStatement: {
			content = `${indent(options)}累了`;
			break;
		}
		case NodeType.MemberAccessExpression: {
			const n = node;
			// 打印 a@b
			content = `${printNodeContent(n.object, options)}@${printNodeContent(n.property, options)}`;
			break;
		}
		case NodeType.UnaryExpression: {
			const n = node;
			const op = n.operator === AssignmentKind.COPY ? '高仿' : '抢走';
			content = `${op} ${printNodeContent(n.argument, options)}`;
			break;
		}
		case NodeType.ArithmeticExpression: {
			const n = node;
			content = `${printNodeContent(n.left, options)} ${n.operator} ${printNodeContent(n.right, options)}`;
			break;
		}
		case NodeType.ComparisonExpression: {
			const n = node;
			const parts: string[] = [];
			for (let i = 0; i < n.expressions.length; i++) {
				parts.push(printNodeContent(n.expressions[i], options));
				if (i < n.operators.length) parts.push(n.operators[i]!.value);
			}
			content = parts.join(' ');
			break;
		}
		case NodeType.LogicalExpression: {
			const n = node;
			const o = {
				[LogicalOperator.AND]: '和',
				[LogicalOperator.OR]: '或',
				[LogicalOperator.NOR]: '和',
				[LogicalOperator.NAND]: '或',
			};
			const c = {
				[LogicalOperator.AND]: '都好',
				[LogicalOperator.OR]: '有好',
				[LogicalOperator.NOR]: '都坏',
				[LogicalOperator.NAND]: '有坏',
			};
			content = `${printNodeContent(n.left, options)} ${o[n.operator]} ${printNodeContent(n.right, options)} ${
				c[n.operator]
			}`;
			break;
		}
		case NodeType.SequenceExpression: {
			const n = node;
			let s = printNodeContent(n.sections[0], options);
			for (let i = 0; i < n.operators.length; i++) {
				s += ` ${n.operators[i]!.value}, ${printNodeContent(n.sections[i + 1], options)}`;
			}
			content = s;
			break;
		}
		case NodeType.Identifier:
			content = printIdentifier(node);
			break;
		case NodeType.NumericLiteral:
			content = String(node.value);
			break;
		case NodeType.StringLiteral: {
			const v = node.value;
			content = v.includes("'") ? `"${v}"` : `'${v}'`;
			break;
		}
		case NodeType.BooleanLiteral:
			content = node.value ? '好喵' : '坏喵';
			break;
		case NodeType.NullLiteral:
			content = '空碗';
			break;
		case NodeType.ErrorNode:
			content = `(喵！解析错误: ${node.message})`;
			break;
		case NodeType.ExpressionStatement: {
			const n = node;
			content = printNodeContent(n.expression, options);
			break;
		}
		default: // 此处已推断为不可达
			const n: never = node;
			console.warn(`[格式化器] 目前无法整理此类节点 `, n);
	}

	return leading + content;
}

export function getFormattedCode(sourceCode: string): string {
	const parser = new Parser(tokenize(sourceCode, { ignoreComments: false }), 'tolerant');
	const { program: ast } = parser.parse();
	const options: FormattingOptions = { indentChar: '\t', level: 0 };
	return printNodeContent(ast, options);
}
