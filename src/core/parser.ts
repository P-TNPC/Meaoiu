// src/core/parser.ts

import type * as AST from './ast.js';
import { AssignmentKind, LogicalOperator, NodeType } from './ast.js';
import { MeaoiuError, errorFrom } from './error.js';
import { OP_ARITH, OP_COMP, OP_COMP_E, type Token, TokenType } from './tokenizer.js';

export const enum ParseMode {
	STRICT,
	TOLERANT,
}

export type ParseResult = {
	program: AST.Program;
	errors: MeaoiuError[];
};

type AssignmentOperator = TokenType.KEYWORD_IS | TokenType.KEYWORD_LIKE | TokenType.KEYWORD_ONLY;

const assignMap = {
	[TokenType.KEYWORD_IS]: AssignmentKind.REFERENCE,
	[TokenType.KEYWORD_LIKE]: AssignmentKind.COPY,
	[TokenType.KEYWORD_ONLY]: AssignmentKind.MOVE,
} as const satisfies Record<AssignmentOperator, AssignmentKind>;

const blockTypeInfo = [
	{
		name: '想法',
		startType: TokenType.BLOCK_START,
		startValue: '[#',
		separatorType: TokenType.TERMINATOR,
		endType: TokenType.BLOCK_END,
		endValue: '#]',
	},
	{
		name: '纸箱',
		startType: TokenType.COLLECTION_START,
		startValue: '[=',
		separatorType: TokenType.COMMA,
		endType: TokenType.COLLECTION_END,
		endValue: '=]',
	},
] as const satisfies {
	name: string;
	separatorType: TokenType;
	startType: TokenType;
	endType: TokenType;
	startValue: string;
	endValue: string;
}[]; // 0: 想法, 1: 纸箱

function tokenTrailing(anchorToken: Token, type: TokenType, value = ''): Token {
	const { line, col: prevCol, value: prevValue } = anchorToken;
	return { type, value, line, col: prevCol + prevValue.length };
}

function createErrorNode({ message, line, col, endLine, endCol }: MeaoiuError): AST.ErrorNode {
	return { type: NodeType.ErrorNode, message, line, col, endLine, endCol };
}

function isStartToken(type: TokenType): boolean {
	switch (type) {
		case TokenType.KEYWORD_USE:
		case TokenType.KEYWORD_LOOP:
		case TokenType.KEYWORD_BREAK:
		case TokenType.KEYWORD_AMBUSH:
		case TokenType.KEYWORD_DEF:
		case TokenType.KEYWORD_CALL:
		case TokenType.KEYWORD_RETURN:
		case TokenType.BLOCK_START:
			return true;
		default:
			return false;
	}
}

function isAssignmentOperator(type: TokenType): type is AssignmentOperator {
	return type === TokenType.KEYWORD_IS || type === TokenType.KEYWORD_LIKE || type === TokenType.KEYWORD_ONLY;
}

export class Parser {
	private readonly tokens: Token[];
	private readonly MODE: ParseMode;
	private readonly MAX_POS: number;
	private position = 0;
	private blockDepth = new Int16Array(2); // 0: 想法, 1: 纸箱
	private errors: MeaoiuError[] = [];

	// 悄悄话缓存：advance / drainCommentsAhead 会把遇到的 COMMENT 放进这里
	private commentBuffer: Token[] = [];

	constructor(tokens: Token[], mode = ParseMode.STRICT) {
		// 确保有 EOF 哨兵，避免边界问题
		if (!tokens.length || tokens[tokens.length - 1]?.type !== TokenType.EOF) {
			tokens = tokens.concat([{ type: TokenType.EOF, value: 'EndOfFile', line: -1, col: -1 }]);
		}
		this.tokens = tokens;
		this.MAX_POS = tokens.length - 1;
		this.MODE = mode;
	}

	// 当前 token（安全）
	private current(): Token {
		return this.tokens[this.position]!;
	}

	// 安全前视 n 个 token
	private peek(n = 1): Token {
		return this.tokens[this.position + n] ?? this.tokens[this.MAX_POS]!;
	}

	/**
	 * 返回当前位置的「非悄悄话 token」，并将位置推进到下一个 token（非悄悄话或 EOF）。
	 * 同时把遇到的 COMMENT 收集到 commentBuffer。
	 * @returns 当前位置的 token（非 COMMENT）
	 */
	private advance(): Token {
		const current = this.drainCommentsAhead(); // 当前非悄悄话 token（或 EOF）
		if (this.position < this.MAX_POS) this.position++;
		return current;
	}

	/**
	 * 推进位置（同时掠取悄悄话）并取得下一 token。
	 * @returns 悄悄话之后一个 token 的再下一 token
	 */
	private next(): Token {
		this.advance();
		return this.current();
	}

	/**
	 * 返回上一个非悄悄话 token（不动位置）。
	 * @returns 上一个非悄悄话 token
	 */
	private lookBack(): Token {
		if (this.position < 1) return this.current();
		let token: Token;
		for (let pos = this.position; (token = this.tokens[--pos]!).type === TokenType.COMMENT && pos > 0; );
		return token;
	}

	/**
	 * 取得当前非悄悄话 token，若当前为悄悄话则连续推进至目标（同时收集悄悄话到 commentBuffer）。
	 * @returns 当前 token 或其后第一个非悄悄话 token（或 EOF）
	 */
	private drainCommentsAhead(): Token {
		let token = this.current();
		while (token.type === TokenType.COMMENT && this.position < this.MAX_POS) {
			this.commentBuffer.push(token);
			token = this.tokens[++this.position]!;
		}
		return token;
	}

	// 从缓存中拿走所有待分配的 leading 悄悄话（并清空缓存）
	private takeLeadingComments(): Token[] {
		const comments = this.commentBuffer;
		this.commentBuffer = [];
		return comments;
	}

	// 把缓存里的悄悄话按是否与 anchorToken 同一行分离：
	// - 同行的视为 trailing（尾随悄悄话），附给 node
	// - 不同的保留为未来节点的 leading（放回 commentBuffer）
	private collectTrailingComments(node: AST.Node, anchorToken: Token): void {
		this.drainCommentsAhead(); // 先把当前位置开始的悄悄话也收进缓存（保证没有漏掉）

		if (!this.commentBuffer.length) return;

		const trailing: Token[] = [];
		const remaining: Token[] = [];

		for (const comment of this.commentBuffer) {
			// 同一行的视为 trailing，不同一行的留作下一节点的 leading
			(comment.line === anchorToken.line ? trailing : remaining).push(comment);
		}

		if (trailing.length) (node.trailingComments ??= []).push(...trailing);

		// 将非 trailing 的悄悄话保留为新的 commentBuffer
		this.commentBuffer = remaining;
	}

	private endLoc(token?: Token): { endLine: number; endCol: number } {
		token ??= this.lookBack();
		return { endLine: token.line, endCol: token.col + token.value.length };
	}

	private reportError(error: MeaoiuError): void {
		if (this.MODE !== ParseMode.TOLERANT) throw error;
		this.errors.push(error); // tolerant 模式记录错误
	}

	private makeErrorTail(type: TokenType, why: string, where?: string): Token {
		// 找到前一个 token 做锚点
		const prevToken = this.lookBack();
		const fakeTermToken = tokenTrailing(prevToken, type);

		const errMsg = `语法错误喵: ${where ?? `在「${prevToken.value}」后`}${why}`;
		this.reportError(errorFrom(fakeTermToken, errMsg));

		return fakeTermToken;
	}

	private expect(type: TokenType, why: string, where?: string): Token {
		const token = this.current();
		if (token.type === type) return this.advance();

		// 返回合成 token（但不移动 position），解析器会以为期望的 token 存在于此锚点
		return this.makeErrorTail(type, why, where);
	}

	private synchronize(): void {
		// 首先尝试找到 TERMINATOR 或语句开始
		for (let tokenType = this.current().type; tokenType !== TokenType.EOF; tokenType = this.next().type) {
			if (tokenType === TokenType.TERMINATOR) return void this.advance();

			if (isStartToken(tokenType)) return;

			if (tokenType === TokenType.BLOCK_END || tokenType === TokenType.COLLECTION_END) {
				const depthIndex = +(tokenType === TokenType.COLLECTION_END);
				if (this.blockDepth[depthIndex]! > 0) return;
				const token = this.current();
				this.errors.push(errorFrom(token, `语法错误喵: 这个「${token.value}」被孤立了喵！`));
				this.blockDepth[depthIndex] = 0; // 龟苓膏之术，对症下药喵
			}
		}
	}

	// 用于 parseExpression 内部：跳到 terminator / statement start / EOF
	private consumeToRecoveryPoint(): void {
		for (
			let tokenType = this.current().type;
			tokenType !== TokenType.EOF && tokenType !== TokenType.TERMINATOR && !isStartToken(tokenType);
			tokenType = this.next().type
		);
	}

	public parse(): ParseResult {
		const startToken = this.current();
		const program: AST.Program = {
			type: NodeType.Program,
			body: [],
			line: startToken.line,
			col: startToken.col,
			endLine: startToken.line,
			endCol: startToken.col,
		};

		for (let tokenType: TokenType; (tokenType = this.current().type) !== TokenType.EOF; ) {
			if (tokenType === TokenType.TERMINATOR) this.advance();
			else program.body.push(this.parseStatement());
		}

		// 如果文件结束后仍有悄悄话缓存在 buffer，把它当成最后一个语句的 trailing（如果存在）
		if (this.commentBuffer.length > 0 && program.body.length > 0) {
			const lastStatement = program.body[program.body.length - 1]!;
			(lastStatement.trailingComments ??= []).push(...this.commentBuffer);
			this.commentBuffer = [];
		}

		const { line: endLine, col: endCol, value: endValue } = this.tokens[this.position - 1] ?? startToken;
		program.endLine = endLine;
		program.endCol = endCol + endValue.length;

		return { program, errors: this.errors };
	}

	private parseStatement(): AST.Statement {
		// 先把当前位置连续的悄悄话收进 buffer（避免 current() 是 COMMENT 的情况）
		const startToken = this.drainCommentsAhead();
		const leading = this.takeLeadingComments(); // 取走当前节点的 leading 悄悄话（如果有）

		try {
			let node: AST.Statement;
			switch (startToken.type) {
				case TokenType.KEYWORD_USE:
					node = this.parseVariableDeclaration(true);
					break;
				case TokenType.KEYWORD_DEF:
					node = this.parseFunctionDeclaration();
					break;
				case TokenType.KEYWORD_RETURN:
					node = this.parseReturnOrAmbushStatement(NodeType.ReturnStatement);
					break;
				case TokenType.KEYWORD_AMBUSH:
					node = this.parseReturnOrAmbushStatement(NodeType.AmbushStatement);
					break;
				case TokenType.KEYWORD_BREAK:
					this.advance();
					node = {
						type: NodeType.BreakStatement,
						line: startToken.line,
						col: startToken.col,
						...this.endLoc(),
					};
					break;
				case TokenType.COLLECTION_END:
				case TokenType.BLOCK_END:
					throw errorFrom(startToken, '语法错误喵: 假的语句喵！');
				default:
					const expression = this.parseExpression();
					const tokenType = this.current().type;

					if (isAssignmentOperator(tokenType)) {
						node = this.parseAssignmentStatement(expression, tokenType); // 将解析好的表达式作为“被赋值者”传入
					} else {
						node = {
							type: NodeType.ExpressionStatement,
							expression,
							line: expression.line,
							col: expression.col,
							...this.endLoc(),
						};
					}
			}
			// 检查终结符但不消耗，消耗的工作交给 parse 和 parseBlockExpression
			const trailingToken = this.current();
			const termToken =
				trailingToken.type !== TokenType.TERMINATOR
					? this.makeErrorTail(TokenType.TERMINATOR, '必须有尾巴「~」喵！')
					: trailingToken;

			if (leading.length) (node.leadingComments ??= []).push(...leading);

			// 收集并分配 terminator 后面的悄悄话（同一行视为 trailing）
			this.collectTrailingComments(node, termToken);
			return node;
		} catch (e) {
			const error = e instanceof MeaoiuError ? e : errorFrom(startToken, e instanceof Error ? e.message : String(e));
			this.reportError(error);
			this.synchronize();
			return createErrorNode(error);
		}
	}

	private parseVariableDeclaration(hasUse: boolean): AST.VariableDeclaration {
		const { line, col } = hasUse ? this.advance() : this.current();
		const identifier = this.parseIdentifier();

		// 检查后面是否紧跟赋值关键字
		const tokenType = this.current().type;
		const initialization = isAssignmentOperator(tokenType)
			? this.parseAssignmentStatement(identifier, tokenType)
			: undefined;

		return { type: NodeType.VariableDeclaration, identifier, initialization, line, col, ...this.endLoc() };
	}

	private parseAssignmentStatement(assignee: AST.Expression, operatorType: AssignmentOperator): AST.AssignmentStatement {
		this.advance();
		const value = this.parseExpression();
		const kind = assignMap[operatorType]!; // 调用前已检查词元类型
		const { line, col } = assignee;
		return { type: NodeType.AssignmentStatement, assignee, value, kind, line, col, ...this.endLoc() };
	}

	private parseFunctionDeclaration(): AST.FunctionDeclaration {
		const { line, col } = this.advance();
		const params = this.parseBlockExpression(true);
		const name = this.parseIdentifier();
		const body = this.parseBlockExpression(false);
		return { type: NodeType.FunctionDeclaration, name, params, body, line, col, ...this.endLoc() };
	}

	private parseReturnOrAmbushStatement(
		nodeType: NodeType.ReturnStatement | NodeType.AmbushStatement
	): AST.ReturnStatement | AST.AmbushStatement {
		const { line, col } = this.advance();
		const argument = this.current().type !== TokenType.TERMINATOR ? this.parseExpression() : undefined;
		return { type: nodeType, argument, line, col, ...this.endLoc() };
	}

	private parseIdentifier(): AST.Identifier {
		this.drainCommentsAhead(); // identifier 也应接收可能的 leading 悄悄话
		const leading = this.takeLeadingComments();

		const { line, col, value: symbol } = this.expect(TokenType.IDENTIFIER, '需要一个标识符喵！');
		const node: AST.Identifier = { type: NodeType.Identifier, symbol, line, col, ...this.endLoc() };

		if (leading.length) node.leadingComments = leading;
		return node;
	}

	private parseExpression(): AST.Expression {
		try {
			return this.parseLogicalExpression();
		} catch (e) {
			const error = e instanceof MeaoiuError ? e : errorFrom(this.current(), e instanceof Error ? e.message : String(e));
			this.reportError(error);
			this.consumeToRecoveryPoint(); // 跳过到下一个安全点
			return createErrorNode(error);
		}
	}

	private parseLogicalExpression(): AST.Expression {
		let left = this.parseSequenceExpression();

		// 循环处理连续的逻辑操作：A 和 B 都好 或 C 有好
		for (
			let tokenType = this.current().type, isOr = tokenType === TokenType.LOGIC_OR;
			isOr || tokenType === TokenType.LOGIC_AND;
			tokenType = this.current().type, isOr = tokenType === TokenType.LOGIC_OR
		) {
			this.advance();
			const right = this.parseLogicalExpression();
			const closeToken = this.current();

			let operator: AST.LogicalExpression['operator'];
			switch (closeToken.type) {
				case TokenType.LOGIC_CLOSE_OR:
					operator = LogicalOperator.OR;
					if (!isOr) this.reportError(errorFrom(closeToken, '逻辑「和」不能用「有好」闭合喵！'));
					break;
				case TokenType.LOGIC_CLOSE_NAND:
					operator = LogicalOperator.NAND;
					if (!isOr) this.reportError(errorFrom(closeToken, '逻辑「和」不能用「有坏」闭合喵！'));
					break;
				case TokenType.LOGIC_CLOSE_AND:
					operator = LogicalOperator.AND;
					if (isOr) this.reportError(errorFrom(closeToken, '逻辑「或」不能用「都好」闭合喵！'));
					break;
				case TokenType.LOGIC_CLOSE_NOR:
					operator = LogicalOperator.NOR;
					if (isOr) this.reportError(errorFrom(closeToken, '逻辑「或」不能用「都坏」闭合喵！'));
					break;
				case TokenType.LOGIC_OR:
				case TokenType.LOGIC_AND:
					throw errorFrom(closeToken, '世界崩坏喵: 你不该看到这个喵！');
				default:
					const [logic, close, nClose] = isOr ? ['或', '有好', '有坏'] : ['和', '都好', '都坏'];
					this.makeErrorTail(closeToken.type, `逻辑「${logic}」要有「${close}」或「${nClose}」闭合喵！`);
					continue;
			}
			this.advance();

			const { line, col } = left;
			left = { type: NodeType.LogicalExpression, left, right, operator, line, col, ...this.endLoc() };
		}

		return left;
	}

	private parseSequenceExpression(): AST.Expression {
		const { line, col } = this.current();
		const sections = [this.parseComparisonExpression()];
		const operators: AST.SequenceExpression['operators'] = [];
		let modeMask = 0b0_00; // 000 算术模式 | 100 比较模式

		for (let token: Token; (token = this.current()).type === TokenType.OPERATOR && this.peek().type === TokenType.COMMA; ) {
			const op = token.value;
			switch (modeMask | (+OP_ARITH.has(op) << 1 || +OP_COMP_E.has(op))) {
				// 模式对应：
				case 0b101: // 1 比较模式|0 无算术|1 有比较
				case 0b010: // 0 算术模式|1 有算术|0 无比较
					break;
				// 模式变换：
				case 0b001: // 0 算术模式|0 无算术|1 有比较
					modeMask = 0b1_00; // 切为比较模式
					break;
				case 0b110: // 1 比较模式|1 有算术|0 无比较
					throw errorFrom(token, '语法错误喵: 比较之后就不能做算术了喵!');
				// 符号非法：
				case 0b000: // 0 算术模式|0 无算术|0 无比较
				case 0b100: // 1 比较模式|0 无算术|0 无比较
					throw errorFrom(token, `语法错误喵: '${op}' 不能用在节之间喵!`);
				// 以下状态理论不可达：
				case 0b011: // 0 算术模式|1 有算术|1 有比较
				case 0b111: // 1 比较模式|1 有算术|1 有比较
					throw errorFrom(token, '世界崩坏喵: 你不该看到这个喵！');
			}

			operators.push(this.advance());
			this.advance(); // 跳过逗号
			sections.push(this.parseComparisonExpression());
		}

		if (sections.length === 1) return sections[0]!;

		return { type: NodeType.SequenceExpression, sections, operators, line, col, ...this.endLoc() };
	}

	private parseComparisonExpression(): AST.Expression {
		const { line, col } = this.current();
		const expressions = [this.parseAdditiveExpression()];
		const operators: AST.ComparisonExpression['operators'] = [];

		while (OP_COMP.has(this.current().value) && this.peek().type !== TokenType.COMMA) {
			operators.push(this.advance());
			expressions.push(this.parseAdditiveExpression());
		}

		// 如果没有比较（只有一个操作数），就返回那个操作数本身
		if (expressions.length === 1) return expressions[0]!;

		// 否则，创建一个链式比较节点
		return { type: NodeType.ComparisonExpression, expressions, operators, line, col, ...this.endLoc() };
	}

	private parseAdditiveExpression(): AST.Expression {
		let left = this.parseMultiplicativeExpression();

		for (
			let token = this.current();
			(token.value === '+' || token.value === '-') && this.peek().type !== TokenType.COMMA;
			token = this.current()
		) {
			this.advance();
			const right = this.parseMultiplicativeExpression();
			const { line, col, value: operator } = token;
			left = { type: NodeType.ArithmeticExpression, left, operator, right, line, col, ...this.endLoc(token) };
		}
		return left;
	}

	private parseMultiplicativeExpression(): AST.Expression {
		let left = this.parseUnaryExpression();

		for (
			let token = this.current();
			(token.value === '*' || token.value === '/') && this.peek().type !== TokenType.COMMA;
			token = this.current()
		) {
			this.advance();
			const right = this.parseUnaryExpression();
			const { line, col, value: operator } = token;
			left = { type: NodeType.ArithmeticExpression, left, operator, right, line, col, ...this.endLoc(token) };
		}
		return left;
	}

	private parseUnaryExpression(): AST.Expression {
		const { type: tokenType, line, col } = this.current();

		let operator: AST.UnaryExpression['operator'];
		switch (tokenType) {
			case TokenType.KEYWORD_CLONE:
				operator = AssignmentKind.COPY;
				break;
			case TokenType.KEYWORD_MOVE:
				operator = AssignmentKind.MOVE;
				break;
			default:
				return this.parseMemberAccessExpression();
		}

		this.advance();
		// 递归调用，这样就可以处理像“高仿 高仿 a”这样的写法
		const argument = this.parseUnaryExpression();

		return { type: NodeType.UnaryExpression, operator, argument, line, col, ...this.endLoc() };
	}

	private parseMemberAccessExpression(): AST.Expression {
		let object = this.parsePrimaryExpression();

		// 循环处理连续的 @ 访问
		for (let startToken: Token; (startToken = this.current()).type === TokenType.ACCESSOR; ) {
			const { type: tokenType, value } = this.next();
			if (tokenType === TokenType.ACCESSOR) {
				this.makeErrorTail(tokenType, `不能连着写一长串「${value}」喵！`);
				continue;
			}

			const property = this.parsePrimaryExpression();
			const { line, col } = startToken;
			object = { type: NodeType.MemberAccessExpression, object, property, line, col, ...this.endLoc() };
		}
		return object;
	}

	private parsePrimaryExpression(): AST.Expression {
		const startToken = this.drainCommentsAhead();
		const leading = this.takeLeadingComments();
		const { type: tokenType, value, line, col } = startToken;

		let node: AST.Expression;
		switch (tokenType) {
			case TokenType.NUMBER:
				node = { type: NodeType.NumericLiteral, value: parseFloat(value), line, col, ...this.endLoc(startToken) };
				break;
			case TokenType.STRING:
				node = { type: NodeType.StringLiteral, value, line, col, ...this.endLoc(startToken) };
				break;
			case TokenType.BOOLEAN:
				node = { type: NodeType.BooleanLiteral, value: value === '好喵', line, col, ...this.endLoc(startToken) };
				break;
			case TokenType.NULL_LITERAL:
				node = { type: NodeType.NullLiteral, value: null, line, col, ...this.endLoc(startToken) };
				break;
			case TokenType.IDENTIFIER:
				node = { type: NodeType.Identifier, symbol: value, line, col, ...this.endLoc(startToken) };
				break;
			case TokenType.KEYWORD_CALL:
				return this.parseCallExpression();
			case TokenType.BLOCK_START:
				return this.parseBlockOrIfExpression();
			case TokenType.COLLECTION_START:
				return this.parseBlockExpression(true);
			case TokenType.KEYWORD_LOOP:
				return this.parseLoopExpression();
			case TokenType.TERMINATOR:
			case TokenType.EOF:
				throw errorFrom(startToken, '语法错误喵: 只说半句看不懂喵！');
			default:
				throw errorFrom(startToken, `语法错误喵: 看不懂的把戏喵: ${value}`);
		}
		this.advance();

		if (leading.length) (node.leadingComments ??= []).push(...leading);

		return node;
	}

	private parseBlockOrIfExpression(): AST.BlockExpression | AST.IfExpression {
		const block = this.parseBlockExpression(false);
		return this.current().type === TokenType.KEYWORD_CONFIRM ? this.parseIfExpression(block) : block;
	}

	private parseBlockExpression(isCollection: true): AST.BlockExpression;
	private parseBlockExpression(isCollection: false): AST.BlockExpression;
	private parseBlockExpression(isCollection: boolean): AST.BlockExpression {
		const modeSwitch = +isCollection;
		const { name, startType, startValue, separatorType, endType, endValue } = blockTypeInfo[modeSwitch]!;
		const { line, col } = this.expect(startType, `${name}需要以「${startValue}」开头喵！`);
		const statementParser = isCollection ? () => this.parseCollectionElement() : () => this.parseStatement();

		const body: AST.BlockExpression['body'] = [];
		this.blockDepth[modeSwitch]!++;

		for (
			let tokenType = this.current().type;
			tokenType !== endType && tokenType !== TokenType.EOF;
			tokenType = this.next().type
		) {
			if (tokenType === separatorType) {
				if (isCollection) this.makeErrorTail(separatorType, `这个「${this.current().value}」是多余的喵！`);
				continue;
			}
			body.push(statementParser());
			if (this.current().type !== separatorType) break;
		}

		this.expect(endType, `${name}需要以「${endValue}」结尾喵！`);
		this.blockDepth[modeSwitch]!--;

		return { type: NodeType.BlockExpression, body, isCollection, line, col, ...this.endLoc() };
	}

	private parseCollectionElement(): AST.Statement {
		const tokenType = this.current().type;
		let hasUse = tokenType === TokenType.KEYWORD_USE;

		// 模式一: 显式声明，例如 `蹭 a 就是 1`
		// 模式二: 隐式声明，例如 `a 就是 1`
		if (hasUse || (tokenType === TokenType.IDENTIFIER && isAssignmentOperator(this.peek().type))) {
			return this.parseVariableDeclaration(hasUse);
		}

		// 模式三：其他所有情况，都是一个独立的表达式
		const expression = this.parseExpression();
		const { line, col } = expression;
		return { type: NodeType.ExpressionStatement, expression, line, col, ...this.endLoc() };
	}

	private parseIfExpression(consequent: AST.BlockExpression): AST.IfExpression {
		this.advance();
		const test = this.parseExpression();
		let alternate: AST.IfExpression['alternate'];

		let tokenType = this.current().type;
		if (tokenType === TokenType.TERMINATOR && this.peek().type === TokenType.KEYWORD_ELSE) tokenType = this.next().type; // 吃掉可选的「~」
		if (tokenType === TokenType.KEYWORD_ELSE) {
			if (this.next().type === TokenType.BLOCK_START) alternate = this.parseBlockOrIfExpression();
			else this.makeErrorTail(TokenType.BLOCK_START, `要有想法「[#...#]」喵！`);
		}

		const { line, col } = consequent;
		return { type: NodeType.IfExpression, consequent, test, alternate, line, col, ...this.endLoc() };
	}

	private parseLoopExpression(): AST.LoopExpression {
		const { line, col } = this.advance();
		const body = this.parseBlockExpression(false);
		return { type: NodeType.LoopExpression, body, line, col, ...this.endLoc() };
	}

	private parseCallExpression(): AST.CallExpression {
		const { line, col } = this.advance();
		const args = this.parseExpression();
		const callee = this.parseIdentifier();
		return { type: NodeType.CallExpression, args, callee, line, col, ...this.endLoc() };
	}
}
