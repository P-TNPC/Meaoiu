// src/core/parser.ts

import type { Token, TokenType } from './tokenizer.js';
import type * as AST from './ast.js';

export interface SyntaxError {
	message: string;
	line: number;
	col: number;
}

export class Parser {
	private mode: 'strict' | 'tolerant';
	private tokens: Token[];
	private position = 0;
	private blockDepth = 0;
	public errors: SyntaxError[] = [];

	// 悄悄话缓存：advance / drainCommentsAhead 会把遇到的 COMMENT 放进这里
	private commentBuffer: Token[] = [];

	constructor(tokens: Token[], mode: 'strict' | 'tolerant' = 'strict') {
		// 确保有 EOF 哨兵，避免边界问题
		if (!tokens.length || tokens[tokens.length - 1]!.type !== 'EOF') {
			tokens = tokens.concat([{ type: 'EOF', value: 'EndOfFile', line: -1, col: -1 } as Token]);
		}
		this.tokens = tokens;
		this.mode = mode;
	}

	// 当前 token（安全）
	private current(): Token {
		return this.tokens[this.position]!;
	}

	// 安全前视 n 个 token
	private lookahead(n = 1): Token {
		return this.tokens[this.position + n] ?? this.tokens[this.tokens.length - 1]!;
	}

	private peek(): Token {
		return this.lookahead(1);
	}

	// advance：返回当前位置的「非悄悄话 token」，并将位置推进到下一个 token（非悄悄话或 EOF）。
	// 同时会把遇到的 COMMENT 收集到 commentBuffer。
	private advance(): Token {
		// 如果当前位置是悄悄话，先把连续悄悄话收集到 buffer，然后继续
		let tok = this.tokens[this.position]!;
		while (tok.type === 'COMMENT') {
			this.commentBuffer.push(tok);
			// 到达 EOF 之前最后的悄悄话，返回 EOF 的情形会在下次调用处理
			if (this.position >= this.tokens.length - 1) break;

			this.position++;
			tok = this.tokens[this.position]!;
		}

		// 返回当前非悄悄话 token（或 EOF）
		const prev = this.tokens[this.position]!;
		if (this.position < this.tokens.length - 1) {
			this.position++;
		} else {
			this.position = this.tokens.length - 1;
		}
		return prev;
	}

	// 把当前位置开始的连续悄悄话收集到 commentBuffer（不返回 token，直接消费）
	// 用在我们想主动把当前位置的悄悄话纳入缓存，但不想立刻构造 AST 的情形。
	private drainCommentsAhead(): void {
		while (this.current().type === 'COMMENT') {
			this.commentBuffer.push(this.current());
			if (this.position < this.tokens.length - 1) this.position++;
			else break;
		}
	}

	// 从缓存中拿走所有待分配的 leading 悄悄话（并清空缓存）
	private takeLeadingComments(): Token[] {
		const c = this.commentBuffer;
		this.commentBuffer = [];
		return c;
	}

	// 把缓存里的悄悄话按是否与 anchorToken 同一行分离：
	// - 同行的视为 trailing，附给 node
	// - 不同的保留为未来节点的 leading（放回 commentBuffer）
	private collectTrailingComments(node: AST.AstNode, anchorToken: Token | undefined): void {
		if (!anchorToken) return;
		// 先把当前位置开始的悄悄话也收进缓存（保证没有漏掉）
		this.drainCommentsAhead();

		if (!this.commentBuffer.length) return;

		const trailing: Token[] = [];
		const remaining: Token[] = [];

		for (const c of this.commentBuffer) {
			// 同一行视为 trailing（紧跟在 terminator 后面的悄悄话）
			if (c.line === anchorToken.line) trailing.push(c);
			else remaining.push(c); // 不同一行，作为下一个节点的 leading
		}

		if (trailing.length) {
			(node as any).trailingComments = (node as any).trailingComments ?? [];
			(node as any).trailingComments.push(...trailing);
		}

		// 将非 trailing 的悄悄话保留为新的 commentBuffer
		this.commentBuffer = remaining;
	}

	// 创建一个合成 token（用于容错模式下返回给下游）
	private makeSyntheticToken(type: TokenType, anchorToken?: Token, value?: string): Token {
		const token = anchorToken ?? this.current();
		const colOffset = token.value ? token.value.length : 0;
		return {
			type,
			value: value ?? '',
			line: token.line,
			col: (token.col ?? 0) + colOffset,
		};
	}

	private expect(type: TokenType, message: string): Token {
		const token = this.current();
		if (token.type === type) return this.advance();

		// 找到前一个 token 做锚点
		const prev = this.tokens[this.position - 1] ?? token;
		const anchorLine = prev.line;
		const anchorCol = prev.col + prev.value.length;

		const errMsg = `语法错误喵: ${type === 'TERMINATOR' ? `在 '${prev.value}' 后面需要一个 '~' 结尾喵!` : message}`;

		if (this.mode === 'strict') {
			const errMsgWithLocation = `[${anchorLine}:${anchorCol}] ${errMsg}`;
			throw new Error(errMsgWithLocation);
		}

		const error: SyntaxError = {
			message: errMsg,
			line: anchorLine,
			col: anchorCol,
		};

		// tolerant 模式记录错误
		this.errors.push(error);

		// 返回合成 token（但不移动 position），解析器会以为期望的 token 存在于此锚点
		return this.makeSyntheticToken(type, prev, type === 'TERMINATOR' ? '~' : '');
	}

	private endLoc(token?: Token): { endLine?: number; endCol?: number } {
		if (!token) token = this.tokens[this.position - 1];
		if (!token) return {};
		return { endLine: token.line, endCol: token.col + (token.value?.length ?? 0) };
	}

	public parse(): { program: AST.Program; errors: SyntaxError[] } {
		const startToken = this.current();
		const program: AST.Program = {
			type: 'Program',
			body: [],
			line: startToken.line,
			col: startToken.col,
		};

		while (this.current().type !== 'EOF') {
			if (this.current().type === 'TERMINATOR') {
				this.advance();
				continue;
			}
			program.body.push(this.parseStatement());
		}

		// 如果文件结束后仍有悄悄话缓存在 buffer，把它当成最后一个语句的 trailing（如果存在）
		if (this.commentBuffer.length > 0 && program.body.length > 0) {
			const last = program.body[program.body.length - 1] as any;
			last.trailingComments = (last.trailingComments ?? []).concat(this.commentBuffer);
			this.commentBuffer = [];
		}

		const endToken = this.tokens[this.position - 1];
		program.endLine = endToken?.line;
		program.endCol = endToken ? endToken.col + (endToken.value?.length ?? 0) : startToken.col;

		return { program, errors: this.errors };
	}

	private synchronize(): void {
		// 首先尝试找到 TERMINATOR 或语句开始
		while (this.current().type !== 'EOF') {
			const currentType = this.current().type;

			if (currentType === 'TERMINATOR') {
				this.advance();
				return;
			}

			if (this.isStatementStart(currentType)) {
				return;
			}

			if (currentType === 'BLOCK_END') {
				if (this.blockDepth > 0) return;
				this.errors.push({
					message: `这个 '${this.current().value}' 被孤立了喵!`,
					line: this.current().line,
					col: this.current().col,
				});
				this.blockDepth = 0; // 龟苓膏之术
			}

			this.advance();
		}
	}

	private consumeToRecoveryPoint(): void {
		// 用于 parseExpression 内部：跳到 , / terminator / statement start / EOF
		let moved = false;
		while (
			this.current().type !== 'EOF' &&
			this.current().type !== 'TERMINATOR' &&
			this.current().type !== 'COMMA' &&
			!this.isStatementStart(this.current().type)
		) {
			this.advance();
			moved = true;
		}
		// 若什么也没跳过，则至少前进一个 token，避免卡住
		if (!moved && this.current().type !== 'EOF') {
			this.advance();
		}
	}

	private isStatementStart(type: TokenType): boolean {
		return [
			'KEYWORD_USE',
			'KEYWORD_LOOP',
			'KEYWORD_DEF',
			'KEYWORD_RETURN',
			'KEYWORD_CALL',
			'KEYWORD_BREAK',
			'BLOCK_START',
		].includes(type as string);
	}

	private formatError(e: Error): SyntaxError {
		const match = e.message.match(/\[(\d+):(\d+)\]/);
		if (match) {
			const [, line, col] = match;
			// 移除匹配到的位置信息部分
			const message = e.message.replace(match[0], '').trim();
			return {
				message: message,
				line: parseInt(line!, 10),
				col: parseInt(col!, 10),
			};
		}
		const token = this.current();
		return {
			message: e.message,
			line: token.line,
			col: token.col,
		};
	}

	private createErrorNode(error: SyntaxError): AST.ErrorNode {
		return {
			type: 'ErrorNode',
			message: error.message,
			line: error.line,
			col: error.col,
			endLine: error.line,
			endCol: error.col,
		};
	}

	private parseIdentifier(): AST.Identifier {
		// identifier 也应接收可能的 leading 悄悄话
		this.drainCommentsAhead();
		const leading = this.takeLeadingComments();

		const t = this.expect('IDENTIFIER', '这里需要一个标识符喵');
		const node: AST.Identifier = {
			type: 'Identifier',
			symbol: t.value,
			line: t.line,
			col: t.col,
			...this.endLoc(t),
		};

		if (leading.length) {
			(node as any).leadingComments = leading;
		}
		return node;
	}

	private parseVariableDeclaration(): AST.VariableDeclaration {
		// 如果这里前面可能有悄悄话（比如参数内部），我们也尽量 attach leading at caller level
		const sT = this.advance();
		const i = this.parseIdentifier();
		const aT = this.advance();
		let k: AST.AssignmentKind;

		if (aT.type === 'KEYWORD_IS') {
			// 就是
			if (this.current().type === 'KEYWORD_CLONE') {
				// 就是 高仿
				this.advance();
				k = 'Copy';
			} else if (this.current().type === 'KEYWORD_SNATCH') {
				// 就是 抢走
				this.advance();
				k = 'Move';
			} else {
				// 就是
				k = 'Reference';
			}
		} else if (aT.type === 'KEYWORD_LIKE') {
			// 就像
			k = 'Copy';
		} else if (aT.type === 'KEYWORD_MOVE_ASSIGN') {
			// 才是
			k = 'Move';
		} else {
			throw new Error(`[${aT.line}:${aT.col}] 声明变量需要使用 '就是', '就像', 或 '才是' 喵`);
		}

		const v = this.parseExpression();
		const eL = this.endLoc();
		return {
			type: 'VariableDeclaration',
			identifier: i,
			kind: k,
			value: v,
			line: sT.line,
			col: sT.col,
			...eL,
		};
	}

	private parseAssignmentStatement(): AST.AssignmentStatement {
		const sT = this.current();
		const a = this.parseIdentifier();
		const aT = this.advance();
		let k: AST.AssignmentKind;

		if (aT.type === 'KEYWORD_IS') {
			// 就是
			if (this.current().type === 'KEYWORD_CLONE') {
				// 就是 高仿
				this.advance();
				k = 'Copy';
			} else if (this.current().type === 'KEYWORD_SNATCH') {
				// 就是 抢走
				this.advance();
				k = 'Move';
			} else {
				// 就是
				k = 'Reference';
			}
		} else if (aT.type === 'KEYWORD_LIKE') {
			// 就像
			k = 'Copy';
		} else if (aT.type === 'KEYWORD_MOVE_ASSIGN') {
			// 才是
			k = 'Move';
		} else {
			throw new Error(`[${aT.line}:${aT.col}] 赋值需要使用 '就是', '就像', 或 '才是' 喵`);
		}

		const v = this.parseExpression();
		const eL = this.endLoc();
		return {
			type: 'AssignmentStatement',
			assignee: a,
			value: v,
			kind: k,
			line: sT.line,
			col: sT.col,
			...eL,
		};
	}

	private parseFunctionDeclaration(): AST.FunctionDeclaration {
		const s = this.advance();
		this.expect('PARAM_START', '计谋声明需要贡品列表喵');
		const p: AST.Identifier[] = [];

		if (this.current().type !== 'PARAM_END') {
			p.push(this.parseIdentifier());
			while (this.current().type === 'COMMA') {
				this.advance();
				p.push(this.parseIdentifier());
			}
		}

		this.expect('PARAM_END', '贡品列表需要结束喵');
		const n = this.parseIdentifier();
		const b = this.parseBlockStatement();
		return {
			type: 'FunctionDeclaration',
			name: n,
			params: p,
			body: b,
			line: s.line,
			col: s.col,
			...this.endLoc(),
		};
	}

	private parseStatement(): AST.Statement {
		// 先把当前位置连续的悄悄话收进 buffer（避免 current() 是 COMMENT 的情况）
		this.drainCommentsAhead();
		// 取走当前节点的 leading 悄悄话（如果有）
		const leading = this.takeLeadingComments();

		const sT = this.current();
		try {
			let s: AST.Statement;
			switch (sT.type) {
				case 'KEYWORD_USE':
					s = this.parseVariableDeclaration();
					break;
				case 'KEYWORD_LOOP':
					s = this.parseLoopStatement();
					break;
				case 'KEYWORD_BREAK':
					this.advance();
					s = {
						type: 'BreakStatement',
						line: sT.line,
						col: sT.col,
						...this.endLoc(sT),
					};
					break;
				case 'KEYWORD_DEF':
					s = this.parseFunctionDeclaration();
					break;
				case 'KEYWORD_CALL':
					s = this.parseCallExpression();
					break;
				case 'KEYWORD_RETURN':
					s = this.parseReturnStatement();
					break;
				case 'BLOCK_START':
					s = this.parseBlockOrIfStatement();
					break;
				case 'IDENTIFIER':
					if (
						this.peek().type === 'KEYWORD_IS' ||
						this.peek().type === 'KEYWORD_LIKE' ||
						this.peek().type === 'KEYWORD_MOVE_ASSIGN'
					) {
						s = this.parseAssignmentStatement();
					} else {
						// 如果标识符后面不是赋值，那么它可能是一个表达式语句的开始
						const expr = this.parseExpression();
						s = { type: 'ExpressionStatement', expression: expr, line: expr.line, col: expr.col, ...this.endLoc() };
					}
					break;
				case 'BLOCK_END':
					throw new Error(`[${sT.line}:${sT.col}] 假的语句喵!`);
				default:
					// 如果不是任何已知的语句关键字，也尝试将其作为表达式语句解析
					const expr = this.parseExpression();
					s = { type: 'ExpressionStatement', expression: expr, line: expr.line, col: expr.col, ...this.endLoc() };
			}
			// 统一通过 expect 检查终结符：在 tolerant 模式下 expect 不会抛
			const termTok = this.expect('TERMINATOR', "每个语句的最后都需要一个 '~' 结尾喵!");

			if (leading.length) {
				(s as any).leadingComments = (s as any).leadingComments ?? [];
				(s as any).leadingComments.push(...leading);
			}
			// 收集并分配 terminator 后面的悄悄话（同一行视为 trailing）
			this.collectTrailingComments(s as any, termTok);
			return s;
		} catch (e: any) {
			if (this.mode === 'tolerant') {
				const error = this.formatError(e);
				this.errors.push(error);
				this.synchronize();
				return this.createErrorNode(error);
			} else {
				throw e;
			}
		}
	}

	private parseBlockOrIfStatement(): AST.Statement {
		const startToken = this.current();
		let peekPos = this.position;
		let braceCount = 0;
		do {
			const token = this.tokens[peekPos];
			if (token?.type === 'BLOCK_START') braceCount++;
			else if (token?.type === 'BLOCK_END') braceCount--;
			peekPos++;
		} while (braceCount > 0 && peekPos < this.tokens.length);

		if (this.tokens[peekPos]?.type === 'KEYWORD_CONFIRM') {
			return this.parseInvertedIfStatement();
		} else {
			const blockExpr = this.parseBlockStatement();
			return {
				type: 'ExpressionStatement',
				expression: blockExpr,
				line: startToken.line,
				col: startToken.col,
				...this.endLoc(),
			};
		}
	}

	private parseInvertedIfStatement(): AST.IfStatement {
		const sT = this.current();
		const consequent = this.parseBlockStatement();
		this.expect('KEYWORD_CONFIRM', "想法后面需要一个 '好不好?' 来提问喵!");
		const test = this.parseExpression();
		let alternate: AST.Statement | undefined;

		if (this.current().type === 'KEYWORD_ELSE') {
			this.advance();
			let pP = this.position;
			if (this.tokens[pP]?.type === 'BLOCK_START') {
				let bC = 0;
				do {
					const t = this.tokens[pP];
					if (t?.type === 'BLOCK_START') bC++;
					else if (t?.type === 'BLOCK_END') bC--;
					pP++;
				} while (bC > 0 && pP < this.tokens.length);

				if (this.tokens[pP]?.type === 'KEYWORD_CONFIRM') {
					alternate = this.parseInvertedIfStatement();
				} else {
					alternate = this.parseBlockStatement();
				}
			} else {
				throw new Error(`[${this.current().line}:${this.current().col}] '不然' 后面必须跟着一个想法 '[#...#]' 喵!`);
			}
		}

		const eL = this.endLoc();
		return {
			type: 'IfStatement',
			test,
			consequent,
			alternate,
			line: sT.line,
			col: sT.col,
			...eL,
		};
	}

	private parseLoopStatement(): AST.LoopStatement {
		const s = this.advance();
		const b = this.parseBlockStatement();
		return {
			type: 'LoopStatement',
			body: b,
			line: s.line,
			col: s.col,
			...this.endLoc(),
		};
	}

	private parseReturnStatement(): AST.ReturnStatement {
		const s = this.advance();
		let a: AST.Expression | undefined;

		if (this.current().type !== 'TERMINATOR') {
			a = this.parseExpression();
		}

		return {
			type: 'ReturnStatement',
			argument: a,
			line: s.line,
			col: s.col,
			...this.endLoc(),
		};
	}

	private parseBlockStatement(): AST.BlockStatement {
		const s = this.expect('BLOCK_START', '想法需要以 [# 开头喵');
		const b: AST.Statement[] = [];
		this.blockDepth++; // 进入想法，深度+1

		while (this.current().type !== 'BLOCK_END' && this.current().type !== 'EOF') {
			if (this.current().type === 'TERMINATOR') {
				this.advance();
				continue;
			}
			b.push(this.parseStatement());
		}

		const e = this.expect('BLOCK_END', '想法需要以 #] 结尾喵');
		this.blockDepth--; // 退出想法，深度-1

		return {
			type: 'BlockStatement',
			body: b,
			line: s.line,
			col: s.col,
			...this.endLoc(e),
		};
	}

	private parseCallExpression(): AST.CallExpression {
		const s = this.advance();
		this.expect('PARAM_START', '计谋施展需要贡品列表喵');
		const a: AST.Argument[] = [];

		if (this.current().type !== 'PARAM_END') {
			do {
				let i = false;
				if (this.current().type === 'KEYWORD_CLONE') {
					this.advance();
					i = true;
				}
				const e = this.parseExpression();
				a.push({
					type: 'Argument',
					expression: e,
					isClone: i,
					line: e.line,
					col: e.col,
					...this.endLoc(),
				});

				if (this.current().type === 'COMMA') {
					this.advance();
				} else {
					break;
				}
			} while (this.current().type !== 'PARAM_END');
		}

		this.expect('PARAM_END', '贡品列表需要结束喵');
		const c = this.parseIdentifier();
		return {
			type: 'CallExpression',
			callee: c,
			args: a,
			line: s.line,
			col: s.col,
			...this.endLoc(),
		};
	}

	// 表达式解析添加容错
	private parseExpression(): AST.Expression {
		if (this.mode === 'tolerant') {
			try {
				return this.parseLogicalOrExpression();
			} catch (e: any) {
				const error = this.formatError(e);
				this.errors.push(error);
				// 跳过到下一个安全点（一定要前进）
				this.consumeToRecoveryPoint();
				return this.createErrorNode(error);
			}
		}
		return this.parseLogicalOrExpression();
	}

	private parseLogicalOrExpression(): AST.Expression {
		let l = this.parseLogicalAndExpression();

		while (this.current().type === 'LOGIC_OR') {
			const s = this.current();
			this.advance();
			const r = this.parseLogicalAndExpression();
			let o: AST.LogicalOperator;

			switch (this.current().type) {
				case 'LOGIC_CLOSE_OR':
					this.advance();
					o = 'OR';
					break;
				case 'LOGIC_CLOSE_NAND':
					this.advance();
					o = 'NAND';
					break;
				default:
					const prevToken = this.tokens[this.position - 1]!;
					const errLine = prevToken.line;
					const errCol = prevToken.col + prevToken.value.length;
					this.position--;
					throw new Error(`[${errLine}:${errCol}] 语法错误喵: 这里要用「有好」或「有坏」闭合喵`);
			}

			l = {
				type: 'LogicalExpression',
				left: l,
				right: r,
				operator: o,
				line: s.line,
				col: s.col,
				...this.endLoc(),
			};
		}

		return l;
	}

	private parseLogicalAndExpression(): AST.Expression {
		let l = this.parseSequenceExpression();

		while (this.current().type === 'LOGIC_AND') {
			const s = this.current();
			this.advance();
			const r = this.parseSequenceExpression();
			let o: AST.LogicalOperator;

			switch (this.current().type) {
				case 'LOGIC_CLOSE_AND':
					this.advance();
					o = 'AND';
					break;
				case 'LOGIC_CLOSE_NOR':
					this.advance();
					o = 'NOR';
					break;
				default:
					const prevToken = this.tokens[this.position - 1]!;
					const errLine = prevToken.line;
					const errCol = prevToken.col + prevToken.value.length;
					this.position--;
					throw new Error(`[${errLine}:${errCol}] 语法错误喵: 这里要用「都好」或「都坏」闭合喵`);
			}

			l = {
				type: 'LogicalExpression',
				left: l,
				right: r,
				operator: o,
				line: s.line,
				col: s.col,
				...this.endLoc(),
			};
		}

		return l;
	}

	private parseSequenceExpression(): AST.Expression {
		const sT = this.current();
		const s = [this.parseSection()];
		const o: Token[] = [];

		while (this.current().type === 'OPERATOR' && this.peek().type === 'COMMA') {
			o.push(this.advance());
			this.advance();
			s.push(this.parseSection());
		}

		if (s.length === 1) return s[0]!;

		return {
			type: 'SequenceExpression',
			sections: s,
			operators: o,
			line: sT.line,
			col: sT.col,
			...this.endLoc(),
		};
	}

	private parseSection(): AST.Expression {
		return this.parseComparisonExpression();
	}

	private parseComparisonExpression(): AST.Expression {
		let l = this.parseAdditiveExpression();

		while (['==', '>', '<', '>=', '<='].includes(this.current().value) && this.peek().type !== 'COMMA') {
			const s = this.current();
			const o = this.advance().value;
			const r = this.parseAdditiveExpression();
			l = {
				type: 'BinaryExpression',
				left: l,
				operator: o,
				right: r,
				line: s.line,
				col: s.col,
				...this.endLoc(),
			};
		}

		return l;
	}

	private parseAdditiveExpression(): AST.Expression {
		let l = this.parseMultiplicativeExpression();

		while ((this.current().value === '+' || this.current().value === '-') && this.peek().type !== 'COMMA') {
			const s = this.current();
			const o = this.advance().value;
			const r = this.parseMultiplicativeExpression();
			l = {
				type: 'BinaryExpression',
				left: l,
				operator: o,
				right: r,
				line: s.line,
				col: s.col,
				...this.endLoc(),
			};
		}

		return l;
	}

	private parseMultiplicativeExpression(): AST.Expression {
		let l = this.parsePrimaryExpression();

		while ((this.current().value === '*' || this.current().value === '/') && this.peek().type !== 'COMMA') {
			const s = this.current();
			const o = this.advance().value;
			const r = this.parsePrimaryExpression();
			l = {
				type: 'BinaryExpression',
				left: l,
				operator: o,
				right: r,
				line: s.line,
				col: s.col,
				...this.endLoc(),
			};
		}

		return l;
	}

	private parsePrimaryExpression(): AST.Expression {
		// 在 primary 开始前先把当前位置的悄悄话收取为 leading
		this.drainCommentsAhead();
		const leading = this.takeLeadingComments();

		const t = this.advance();

		let node: AST.Expression;
		switch (t.type) {
			case 'NUMBER':
				node = {
					type: 'NumericLiteral',
					value: parseFloat(t.value),
					line: t.line,
					col: t.col,
					...this.endLoc(t),
				};
				break;
			case 'STRING':
				node = {
					type: 'StringLiteral',
					value: t.value,
					line: t.line,
					col: t.col,
					...this.endLoc(t),
				};
				break;
			case 'BOOLEAN':
				node = {
					type: 'BooleanLiteral',
					value: t.value === '好喵',
					line: t.line,
					col: t.col,
					...this.endLoc(t),
				};
				break;
			case 'NULL_LITERAL':
				node = {
					type: 'NullLiteral',
					value: null,
					line: t.line,
					col: t.col,
					...this.endLoc(t),
				};
				break;
			case 'IDENTIFIER':
				node = {
					type: 'Identifier',
					symbol: t.value,
					line: t.line,
					col: t.col,
					...this.endLoc(t),
				};
				break;
			case 'KEYWORD_CALL':
				this.position--; // 把指针拨回去，让 parseCallExpression 处理
				return this.parseCallExpression();
			case 'BLOCK_START':
				this.position--; // 把指针拨回去，让 parseBlockOrIfStatement 处理
				return this.parseBlockOrIfStatement() as AST.Expression;
			case 'KEYWORD_LOOP':
				this.position--; // 把指针拨回去，让 parseLoopStatement 处理
				return this.parseLoopStatement();
			default:
				// 未知 token：在 strict 模式抛；在 tolerant 模式生成 ErrorNode 并至少前进一个 token
				const err = new Error(`[${t.line}:${t.col}] 不认识的把戏喵: ${t.value}`);
				if (this.mode === 'tolerant') {
					const se = this.formatError(err);
					this.errors.push(se);
					// 已经 advance 了一次（t 是 advance 返回的），此处不用再次 advance
					return this.createErrorNode(se);
				}
				throw err;
		}

		if (leading.length) {
			(node as any).leadingComments = (node as any).leadingComments ?? [];
			(node as any).leadingComments.push(...leading);
		}

		return node;
	}
}
