// src/core/parser.ts

import type * as AST from './ast.js';
import { NodeKind } from './ast.js';
import { MeaoiuError, Phase, errorFrom } from './error.js';
import { TokenKind, newToken, type ComparisonTokenKind, type Token } from './lexer/tokenizer.js';

export const enum ParseMode {
	STRICT,
	TOLERANT,
}

export type ParseResult = {
	program: AST.Program;
	errors: MeaoiuError[];
};

const blockKindInfo = [
	{
		name: '想法',
		startKind: TokenKind.BLOCK_START,
		startValue: '[#',
		separatorKind: TokenKind.TERMINATOR,
		endKind: TokenKind.BLOCK_END,
		endValue: '#]',
	},
	{
		name: '纸箱',
		startKind: TokenKind.COLLECTION_START,
		startValue: '[=',
		separatorKind: TokenKind.COMMA,
		endKind: TokenKind.COLLECTION_END,
		endValue: '=]',
	},
] as const satisfies {
	name: string;
	separatorKind: TokenKind;
	startKind: TokenKind;
	endKind: TokenKind;
	startValue: string;
	endValue: string;
}[]; // 0: 想法, 1: 纸箱

const syntaxErrorFrom = (ele: Token, message: string) => errorFrom(ele, message, Phase.SYNTACTIC);

function errorNodeWith({ message, line, col, endLine, endCol }: MeaoiuError): AST.ErrorNode {
	return { kind: NodeKind.ErrorNode, message, line, col, endLine, endCol };
}

const enum ArithmeticPrecedence {
	NONE = 0,
	ADDITIVE = 1,
	MULTIPLICATIVE = 2,
}

function isComparisonToken(token: Token): token is Token<ComparisonTokenKind> {
	switch (token.kind) {
		case TokenKind.COMPARISON_GREATER:
		case TokenKind.COMPARISON_LESS:
		case TokenKind.COMPARISON_GREATER_EQUAL:
		case TokenKind.COMPARISON_LESS_EQUAL:
		case TokenKind.COMPARISON_EQUAL:
		case TokenKind.COMPARISON_NOT_EQUAL:
			return true;
		default:
			return false;
	}
}
function isStartToken(kind: TokenKind): boolean {
	switch (kind) {
		case TokenKind.KEYWORD_USE:
		case TokenKind.KEYWORD_LOOP:
		case TokenKind.KEYWORD_BREAK:
		case TokenKind.KEYWORD_AMBUSH:
		case TokenKind.KEYWORD_DEF:
		case TokenKind.KEYWORD_CALL:
		case TokenKind.KEYWORD_RETURN:
		case TokenKind.BLOCK_START:
			return true;
		default:
			return false;
	}
}

function isAssignmentOperator(kind: TokenKind): kind is AST.AssignmentStatement['operator'] {
	return kind === TokenKind.ASSIGNMENT_IS || kind === TokenKind.ASSIGNMENT_LIKE || kind === TokenKind.ASSIGNMENT_ONLY;
}

class Parser {
	private readonly tokens: Token[];
	private readonly MODE: ParseMode;
	private readonly MAX_POS: number;
	private readonly blockDepth = new Int16Array(2); // 0: 想法, 1: 纸箱
	private readonly errors: MeaoiuError[] = [];
	private position = 0;

	// 悄悄话缓存：advance / drainCommentsAhead 会把遇到的 COMMENT 放进这里
	private commentBuffer: Token[] = [];

	constructor(tokens: Token[], mode: ParseMode = ParseMode.STRICT) {
		this.MODE = mode;
		// 确保有 EOF 哨兵，避免边界问题
		if (!tokens.length || tokens[tokens.length - 1]!.kind !== TokenKind.EOF) {
			const EOF = newToken(TokenKind.EOF, 'EndOfFile', -1, -1, -1, -1);
			tokens.push((this.reportError(errorFrom(EOF, '分词器可能坏了喵~', Phase.INVARIANT)), EOF));
		}
		this.tokens = tokens;
		this.MAX_POS = tokens.length - 1;
	}

	// 当前 token（安全！）
	private current(): Token {
		return this.tokens[this.position]!;
	}

	// 安全前视 n 个 token
	private peek(n = 1): Token {
		return this.tokens[Math.min(this.position + n, this.MAX_POS)]!;
	}

	/**
	 * 返回当前位置的「非悄悄话 token」，并将位置推进到下一个 token（非悄悄话或 EOF），
	 * 同时把遇到的悄悄话收集到 commentBuffer
	 * @returns 当前位置的 token（非 COMMENT）
	 */
	private advance(): Token {
		const current = this.drainCommentsAhead(); // 当前非悄悄话 token（或 EOF）
		if (this.position < this.MAX_POS) this.position++;
		return current;
	}

	/**
	 * 推进位置（同时掠取悄悄话）并取得下一 token
	 * @returns 悄悄话之后一个 token 的再下一 token
	 */
	private next(): Token {
		this.advance();
		return this.current();
	}

	/**
	 * 返回上一个非悄悄话 token（不动位置）
	 * @returns 上一个非悄悄话 token
	 */
	private lookBack(): Token {
		if (this.position < 1) return this.current();
		let token: Token;
		for (let pos = this.position; (token = this.tokens[--pos]!).kind === TokenKind.COMMENT && pos > 0; );
		return token;
	}

	/**
	 * 取得当前非悄悄话 token，若当前为悄悄话则连续推进至目标（同时收集悄悄话到 commentBuffer）
	 * @returns 当前 token 或其后第一个非悄悄话 token（或 EOF）
	 */
	private drainCommentsAhead(): Token {
		let token = this.current();
		while (token.kind === TokenKind.COMMENT && this.position < this.MAX_POS) {
			this.commentBuffer.push(token);
			token = this.tokens[++this.position]!;
		}
		return token;
	}

	/**
	 * 从缓存中拿走所有待分配的 leading 悄悄话（并清空缓存）
	 * @returns 所有待分配的悄悄话
	 */
	private takeLeadingComments(): Token[] {
		const comments = this.commentBuffer;
		this.commentBuffer = [];
		return comments;
	}

	/**
	 * 把缓存里的悄悄话按是否与 anchorToken 同一行分离：
	 * - 同行的视为 trailing（尾随悄悄话），附给 node
	 * - 不同的保留为未来节点的 leading（放回 commentBuffer）
	 */
	private collectTrailingComments(node: AST.Node, anchorToken: Token): void {
		this.drainCommentsAhead(); // 先把当前位置开始的悄悄话也收进缓存（保证没有漏掉）

		if (!this.commentBuffer.length) return;

		const trailing: Token[] = [];
		const remaining: Token[] = [];

		// 同一行的视为 trailing，不同一行的留作下一节点的 leading
		for (const comment of this.commentBuffer) (comment.line === anchorToken.line ? trailing : remaining).push(comment);

		if (trailing.length) (node.trailingComments ??= []).push(...trailing);

		// 将非 trailing 的悄悄话保留为新的 commentBuffer
		this.commentBuffer = remaining;
	}

	private endLoc({ endLine, endCol }: Token = this.lookBack()): { endLine: number; endCol: number } {
		return { endLine, endCol };
	}

	private reportError(error: MeaoiuError): void {
		if (this.MODE !== ParseMode.TOLERANT) throw error;
		this.errors.push(error); // tolerant 模式记录错误
	}

	/**
	 * 虚构尾随词元并报告错误。
	 * @param kind 虚构词元种类，若无预期则可传 TokenKind.ERROR
	 * @returns 虚构 token
	 */
	private makeErrorTail(kind: TokenKind, why: string, where?: string): Token {
		// 找到前一个 token 做锚点
		const { endLine, endCol, value } = this.lookBack();
		const fakeTermToken = newToken(kind, '', endLine, endCol, endLine, endCol);

		const errMsg = `${where ?? `在「${value}」后`}${why}`;
		this.reportError(syntaxErrorFrom(fakeTermToken, errMsg));

		return fakeTermToken;
	}

	private expect(kind: TokenKind, why: string, where?: string): Token {
		const token = this.current();
		if (token.kind === kind) return this.advance();

		// 返回合成 token（但不移动 position），解析器会以为期望的 token 存在于此锚点
		return this.makeErrorTail(kind, why, where);
	}

	private synchronize(): void {
		// 首先尝试找到 TERMINATOR 或语句开始，跳过闭块符，顺便捕获块配对问题
		for (let tokenKind = this.current().kind; tokenKind !== TokenKind.EOF; tokenKind = this.next().kind) {
			if (tokenKind === TokenKind.TERMINATOR) return void this.advance();
			if (isStartToken(tokenKind)) return;

			const depthIndex = +(tokenKind === TokenKind.COLLECTION_END);
			if (!depthIndex && tokenKind !== TokenKind.BLOCK_END) continue;

			if (this.blockDepth[depthIndex]! > 0) return;
			const token = this.current();
			this.reportError(syntaxErrorFrom(token, `这个「${token.value}」被孤立了喵！`));
			this.blockDepth[depthIndex] = 0; // 龟苓膏之术，对症下药喵
		}
	}

	// 用于 parseExpression 内部：跳到 terminator / statement start / EOF
	private consumeToRecoveryPoint(): void {
		for (
			let tokenKind = this.current().kind;
			tokenKind !== TokenKind.EOF && tokenKind !== TokenKind.TERMINATOR && !isStartToken(tokenKind);
			tokenKind = this.next().kind
		);
	}

	public parse(): ParseResult {
		const { kind: startKind, line, col, endLine, endCol } = this.current();
		const program: AST.Program = { kind: NodeKind.Program, body: [], line, col, endLine, endCol };

		for (let tokenKind = startKind; tokenKind !== TokenKind.EOF; tokenKind = this.current().kind) {
			if (tokenKind === TokenKind.TERMINATOR) this.advance();
			else program.body.push(this.parseStatement());
		}

		// 如果文件结束后仍有悄悄话缓存在 buffer，把它当成最后一个语句的 trailing（如果存在）
		if (this.commentBuffer.length > 0 && program.body.length > 0) {
			const lastStatement = program.body[program.body.length - 1]!;
			(lastStatement.trailingComments ??= []).push(...this.commentBuffer);
			this.commentBuffer = [];
		}

		({ endLine: program.endLine, endCol: program.endCol } = this.tokens[Math.max(0, this.position - 1)]!);

		return { program, errors: this.errors };
	}

	private parseStatement(): AST.Statement {
		// 先把当前位置连续的悄悄话收进 buffer（避免 current() 是 COMMENT 的情况）
		const startToken = this.drainCommentsAhead();
		const leading = this.takeLeadingComments(); // 取走当前节点的 leading 悄悄话（如果有）

		try {
			let node: AST.Statement;
			switch (startToken.kind) {
				case TokenKind.KEYWORD_USE:
					node = this.parseVariableDeclaration(true);
					break;
				case TokenKind.KEYWORD_DEF:
					node = this.parseFunctionDeclaration();
					break;
				case TokenKind.KEYWORD_RETURN:
					node = this.parseReturnOrAmbushStatement(NodeKind.ReturnStatement);
					break;
				case TokenKind.KEYWORD_AMBUSH:
					node = this.parseReturnOrAmbushStatement(NodeKind.AmbushStatement);
					break;
				case TokenKind.KEYWORD_BREAK:
					this.advance();
					node = { kind: NodeKind.BreakStatement, line: startToken.line, col: startToken.col, ...this.endLoc() };
					break;
				case TokenKind.COLLECTION_END:
				case TokenKind.BLOCK_END:
					throw syntaxErrorFrom(startToken, '假的语句喵！');
				default:
					const expression = this.parseExpression();
					const tokenKind = this.current().kind;

					if (isAssignmentOperator(tokenKind)) {
						node = this.parseAssignmentStatement(expression, tokenKind); // 将解析好的表达式作为“被赋值者”传入
					} else {
						const { line, col } = expression;
						node = { kind: NodeKind.ExpressionStatement, expression, line, col, ...this.endLoc() };
					}
			}
			// 检查终结符但不消耗，消耗的工作交给 parse 和 parseBlockExpression
			const trailingToken = this.current();
			const termToken =
				trailingToken.kind !== TokenKind.TERMINATOR
					? this.makeErrorTail(TokenKind.TERMINATOR, '必须有尾巴「~」喵！')
					: trailingToken;

			if (leading.length) (node.leadingComments ??= []).push(...leading);

			// 收集并分配 terminator 后面的悄悄话（同一行视为 trailing）
			this.collectTrailingComments(node, termToken);
			return node;
		} catch (e) {
			const error = e instanceof MeaoiuError ? e : errorFrom(startToken, String(e), Phase.UNKNOWN);
			this.reportError(error);
			this.synchronize();
			return errorNodeWith(error);
		}
	}

	private parseVariableDeclaration(hasUse: boolean): AST.VariableDeclaration {
		const { line, col } = hasUse ? this.advance() : this.current();
		const identifier = this.parseIdentifier();

		// 检查后面是否紧跟赋值关键字
		const tokenKind = this.current().kind;
		const initialization = isAssignmentOperator(tokenKind)
			? this.parseAssignmentStatement(identifier, tokenKind)
			: undefined;

		return { kind: NodeKind.VariableDeclaration, identifier, initialization, line, col, ...this.endLoc() };
	}

	private parseAssignmentStatement(
		assignee: AST.Expression,
		operator: AST.AssignmentStatement['operator'],
	): AST.AssignmentStatement {
		this.advance();
		const value = this.parseExpression();
		const { line, col } = assignee;
		return { kind: NodeKind.AssignmentStatement, assignee, value, operator, line, col, ...this.endLoc() };
	}

	private parseFunctionDeclaration(): AST.FunctionDeclaration {
		const { line, col } = this.advance();
		const parameters = this.parseBlockExpression(true);
		const name = this.parseIdentifier();
		const body = this.parseBlockExpression(false);
		return { kind: NodeKind.FunctionDeclaration, name, parameters, body, line, col, ...this.endLoc() };
	}

	private parseReturnOrAmbushStatement(
		nodeKind: NodeKind.ReturnStatement | NodeKind.AmbushStatement,
	): AST.ReturnStatement | AST.AmbushStatement {
		const { line, col } = this.advance();
		const argument = this.current().kind !== TokenKind.TERMINATOR ? this.parseExpression() : undefined;
		return { kind: nodeKind, argument, line, col, ...this.endLoc() };
	}

	private parseIdentifier(): AST.Identifier {
		this.drainCommentsAhead(); // identifier 也应接收可能的 leading 悄悄话
		const leading = this.takeLeadingComments();

		const { line, col, value: symbol } = this.expect(TokenKind.IDENTIFIER, '需要一个标识符喵！');
		const node: AST.Identifier = { kind: NodeKind.Identifier, symbol, line, col, ...this.endLoc() };

		if (leading.length) node.leadingComments = leading;
		return node;
	}

	private parseExpression(): AST.Expression {
		try {
			return this.parseLogicalExpression();
		} catch (e) {
			const error = e instanceof MeaoiuError ? e : errorFrom(this.current(), String(e), Phase.UNKNOWN);
			this.reportError(error);
			this.consumeToRecoveryPoint(); // 跳过到下一个安全点
			return errorNodeWith(error);
		}
	}

	private parseLogicalExpression(): AST.Expression {
		let left = this.parseSequenceExpression();

		// 循环处理连续的逻辑操作：A 和 B 都好 或 C 不坏
		for (
			let tokenKind: TokenKind, isOr: boolean;
			(isOr = (tokenKind = this.current().kind) === TokenKind.LOGIC_OR) || tokenKind === TokenKind.LOGIC_AND;
		) {
			this.advance();
			const right = this.parseLogicalExpression();
			const closeToken = this.current();

			const operator = closeToken.kind;
			switch (operator) {
				case TokenKind.LOGIC_CLOSE_OR:
					if (!isOr) this.reportError(syntaxErrorFrom(closeToken, '逻辑「和」不能用「不坏」闭合喵！'));
					break;
				case TokenKind.LOGIC_CLOSE_NAND:
					if (!isOr) this.reportError(syntaxErrorFrom(closeToken, '逻辑「和」不能用「不好」闭合喵！'));
					break;
				case TokenKind.LOGIC_CLOSE_AND:
					if (isOr) this.reportError(syntaxErrorFrom(closeToken, '逻辑「或」不能用「都好」闭合喵！'));
					break;
				case TokenKind.LOGIC_CLOSE_NOR:
					if (isOr) this.reportError(syntaxErrorFrom(closeToken, '逻辑「或」不能用「都坏」闭合喵！'));
					break;
				case TokenKind.LOGIC_OR:
				case TokenKind.LOGIC_AND:
					throw errorFrom(closeToken, '你不该看到这个喵！', Phase.INVARIANT);
				default:
					const [logic, close, nClose] = isOr ? ['或', '不坏', '不好'] : ['和', '都好', '都坏'];
					this.makeErrorTail(TokenKind.ERROR, `逻辑「${logic}」要有「${close}」或「${nClose}」闭合喵！`);
					continue;
			}
			this.advance();

			const { line, col } = left;
			left = { kind: NodeKind.LogicalExpression, left, right, operator, line, col, ...this.endLoc() };
		}
		return left;
	}

	private parseSequenceExpression(): AST.Expression {
		const { line, col } = this.current();
		const sections = [this.parseComparisonExpression()];
		const operators: AST.SequenceExpression['operators'] = [];

		sequence: for (let isArithmeticMode = true; this.peek().kind === TokenKind.COMMA; ) {
			const token = this.current();
			switch (token.kind) {
				case TokenKind.ARITHMETIC_PLUS:
				case TokenKind.ARITHMETIC_MINUS:
				case TokenKind.ARITHMETIC_MULTIPLY:
				case TokenKind.ARITHMETIC_DIVIDE:
					if (isArithmeticMode) break; // 模式正确
					throw syntaxErrorFrom(token, '比较之后就不能做算术了喵！');
				case TokenKind.COMPARISON_EQUAL:
				case TokenKind.COMPARISON_NOT_EQUAL:
					isArithmeticMode = false; // 禁用算术模式
					break;
				case TokenKind.COMPARISON_GREATER:
				case TokenKind.COMPARISON_LESS:
				case TokenKind.COMPARISON_GREATER_EQUAL:
				case TokenKind.COMPARISON_LESS_EQUAL:
					throw syntaxErrorFrom(token, `'${token.value}' 不能用在节之间喵！`);
				default:
					break sequence;
			}

			this.advance(); // 消费操作符
			this.advance(); // 跳过逗号
			operators.push(token);
			sections.push(this.parseComparisonExpression());
		}
		if (sections.length === 1) return sections[0]!;

		return { kind: NodeKind.SequenceExpression, sections, operators, line, col, ...this.endLoc() };
	}

	private parseComparisonExpression(): AST.Expression {
		const { line, col } = this.current();
		const expressions = [this.parseArithmeticExpression(ArithmeticPrecedence.NONE)];
		const operators: AST.ComparisonExpression['operators'] = [];

		for (let token: Token; isComparisonToken((token = this.current())) && this.peek().kind !== TokenKind.COMMA; ) {
			this.advance();
			operators.push(token);
			expressions.push(this.parseArithmeticExpression(ArithmeticPrecedence.NONE));
		}

		// 如果没有比较（只有一个操作数），就返回那个操作数本身
		if (expressions.length === 1) return expressions[0]!;

		// 否则，创建一个链式比较节点
		return { kind: NodeKind.ComparisonExpression, expressions, operators, line, col, ...this.endLoc() };
	}

	private parseArithmeticExpression(minPrecedence: ArithmeticPrecedence): AST.Expression {
		let left = this.parseUnaryExpression();

		arithmetic: for (let precedence = minPrecedence; this.peek().kind !== TokenKind.COMMA; ) {
			const operator = this.current();
			switch (operator.kind) {
				case TokenKind.ARITHMETIC_MULTIPLY:
				case TokenKind.ARITHMETIC_DIVIDE:
					precedence = ArithmeticPrecedence.MULTIPLICATIVE;
					break;
				case TokenKind.ARITHMETIC_PLUS:
				case TokenKind.ARITHMETIC_MINUS:
					precedence = ArithmeticPrecedence.ADDITIVE;
					break;
				default:
					break arithmetic;
			}
			if (precedence <= minPrecedence) break arithmetic;

			this.advance();
			const right = this.parseArithmeticExpression(precedence);
			const { line, col } = left;
			left = { kind: NodeKind.ArithmeticExpression, left, operator, right, line, col, ...this.endLoc() };
		}
		return left;
	}

	private parseUnaryExpression(): AST.Expression {
		const { kind: tokenKind, line, col } = this.current();

		let operator: AST.UnaryExpression['operator'];
		switch (tokenKind) {
			case TokenKind.KEYWORD_CLONE:
				operator = TokenKind.ASSIGNMENT_LIKE;
				break;
			case TokenKind.KEYWORD_MOVE:
				operator = TokenKind.ASSIGNMENT_ONLY;
				break;
			default:
				return this.parseMemberAccessExpression();
		}

		this.advance();
		// 递归调用，这样就可以处理像“高仿 高仿 a”这样的写法
		const argument = this.parseUnaryExpression();

		return { kind: NodeKind.UnaryExpression, operator, argument, line, col, ...this.endLoc() };
	}

	private parseMemberAccessExpression(): AST.Expression {
		let object = this.parsePrimaryExpression();

		// 循环处理连续的 @ 访问
		for (let startToken: Token; (startToken = this.current()).kind === TokenKind.ACCESSOR; ) {
			const { kind: tokenKind, value } = this.next();
			if (tokenKind === TokenKind.ACCESSOR) {
				this.makeErrorTail(TokenKind.ERROR, `不能连着写一长串「${value}」喵！`);
				continue;
			}

			const property = this.parsePrimaryExpression();
			const { line, col } = startToken;
			object = { kind: NodeKind.MemberAccessExpression, object, property, line, col, ...this.endLoc() };
		}
		return object;
	}

	private parsePrimaryExpression(): AST.Expression {
		const startToken = this.drainCommentsAhead();
		const leading = this.takeLeadingComments();
		const { kind: tokenKind, value, line, col } = startToken;

		let node: AST.Expression;
		switch (tokenKind) {
			case TokenKind.NUMBER:
				node = {
					kind: NodeKind.NumericLiteral,
					value: Number.parseFloat(value),
					line,
					col,
					...this.endLoc(startToken),
				};
				break;
			case TokenKind.STRING:
				node = { kind: NodeKind.StringLiteral, value, line, col, ...this.endLoc(startToken) };
				break;
			case TokenKind.BOOLEAN:
				node = { kind: NodeKind.BooleanLiteral, value: value === '好喵', line, col, ...this.endLoc(startToken) };
				break;
			case TokenKind.NULL:
				node = { kind: NodeKind.NullLiteral, value: null, line, col, ...this.endLoc(startToken) };
				break;
			case TokenKind.IDENTIFIER:
				node = { kind: NodeKind.Identifier, symbol: value, line, col, ...this.endLoc(startToken) };
				break;
			case TokenKind.KEYWORD_CALL:
				return this.parseCallExpression();
			case TokenKind.BLOCK_START:
				return this.parseBlockOrIfExpression();
			case TokenKind.COLLECTION_START:
				return this.parseBlockExpression(true);
			case TokenKind.KEYWORD_LOOP:
				return this.parseLoopExpression();
			case TokenKind.TERMINATOR:
			case TokenKind.EOF:
				throw syntaxErrorFrom(startToken, '只说半句看不懂喵！');
			case TokenKind.ERROR:
				throw errorFrom(startToken, `这个词不对劲喵：${value}`, Phase.LEXICAL);
			default:
				throw syntaxErrorFrom(startToken, `看不懂的把戏喵：${value}`);
		}
		this.advance();

		if (leading.length) (node.leadingComments ??= []).push(...leading);

		return node;
	}

	private parseBlockOrIfExpression(): AST.BlockExpression | AST.IfExpression {
		const block = this.parseBlockExpression(false);
		return this.current().kind === TokenKind.KEYWORD_CONFIRM ? this.parseIfExpression(block) : block;
	}

	private parseBlockExpression(isCollection: boolean): AST.BlockExpression {
		const modeSwitch = +isCollection;
		const { name, startKind, startValue, separatorKind, endKind, endValue } = blockKindInfo[modeSwitch]!;
		const { line, col } = this.expect(startKind, `${name}需要以「${startValue}」开头喵！`);
		const statementParser = isCollection ? () => this.parseCollectionElement() : () => this.parseStatement();

		const body: AST.BlockExpression['body'] = [];
		this.blockDepth[modeSwitch]!++;

		for (
			let tokenKind = this.current().kind;
			tokenKind !== endKind && tokenKind !== TokenKind.EOF;
			tokenKind = this.next().kind
		) {
			if (tokenKind === separatorKind) {
				if (isCollection) this.makeErrorTail(TokenKind.ERROR, `这个「${this.current().value}」是多余的喵！`);
				continue;
			}
			body.push(statementParser());
			if (this.current().kind !== separatorKind) break;
		}

		this.expect(endKind, `${name}需要以「${endValue}」结尾喵！`);
		this.blockDepth[modeSwitch]!--;

		return { kind: NodeKind.BlockExpression, body, isCollection, line, col, ...this.endLoc() };
	}

	private parseCollectionElement(): AST.Statement {
		const tokenKind = this.current().kind;
		let hasUse = tokenKind === TokenKind.KEYWORD_USE;

		// 模式一: 显式声明，例如 `蹭 a 就是 1`
		// 模式二: 隐式声明，例如 `a 就是 1`
		if (hasUse || (tokenKind === TokenKind.IDENTIFIER && isAssignmentOperator(this.peek().kind))) {
			return this.parseVariableDeclaration(hasUse);
		}

		// 模式三：其他所有情况，都是一个独立的表达式
		const expression = this.parseExpression();
		const { line, col } = expression;
		return { kind: NodeKind.ExpressionStatement, expression, line, col, ...this.endLoc() };
	}

	private parseIfExpression(consequent: AST.BlockExpression): AST.IfExpression {
		this.advance();
		const condition = this.parseExpression();
		let alternate: AST.IfExpression['alternate'];

		const tokenKind = this.current().kind;
		if (
			tokenKind === TokenKind.KEYWORD_ELSE ||
			(tokenKind === TokenKind.TERMINATOR &&
				this.peek().kind === TokenKind.KEYWORD_ELSE &&
				(this.next() /* 吃掉可选「~」*/, true))
		) {
			if (this.next().kind === TokenKind.BLOCK_START) alternate = this.parseBlockOrIfExpression();
			else this.makeErrorTail(TokenKind.BLOCK_START, `要有想法「[#...#]」喵！`);
		}

		const { line, col } = consequent;
		return { kind: NodeKind.IfExpression, consequent, condition, alternate, line, col, ...this.endLoc() };
	}

	private parseLoopExpression(): AST.LoopExpression {
		const { line, col } = this.advance();
		const body = this.parseBlockExpression(false);
		return { kind: NodeKind.LoopExpression, body, line, col, ...this.endLoc() };
	}

	private parseCallExpression(): AST.CallExpression {
		const { line, col } = this.advance();
		const args = this.parseExpression();
		const callee = this.parseIdentifier();
		return { kind: NodeKind.CallExpression, args, callee, line, col, ...this.endLoc() };
	}
}

export function parse(tokens: Token[], mode: ParseMode = ParseMode.STRICT): ParseResult {
	return new Parser(tokens, mode).parse();
}
