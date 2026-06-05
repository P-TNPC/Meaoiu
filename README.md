# 喵谕 Meaoiu
> 知识好喵~
## 这是什么喵 (简介)
这是一门用手糊出来的、不确定是否适合正常人的编程语言喵~ 它不仅有一套**不**需要去挂精神科的**普通**语法，还极其自然地自带了代码格式化、静态诊断、自动补全等一整套工具喵~
### 不简之介
想懂就来这看看喵 -> **[喵谕语言半解](LANGUAGE_GUIDE.md)**

## 怎么领回家喵 (安装)
别问我为什么，既然是 Node.js 做的破烂，安装当然是用 npm 喵~

```bash
npm install -g meaoiu
```

（你也可以自己把这团代码抓下来执行 `npm install` 然后 `npm run build`，随你便喵）

## 怎么求它施法喵 (命令接口使用)
别告诉我你连终端模拟器都不认识喵~
大喊 `meaoiu` 召唤它喵！
文件名后缀是 `.miu` 喵~ 奇怪的东西不可以喵~

 **咏唱你的小作文喵**：`meaoiu <你的大典.miu>`
- **--diagnose**：静态诊断喵~ 看看你的著作里藏了什么语病喵~
- **--format**：格式整理喵~ 能把你那像狗啃一样乱的缩进和换行变得像猫舔一样乱喵~
- **--definition <行:列>**：定义追溯喵~ 比如 `meaoiu 你的大典.miu --definition 2:3`，去抓这个玩具的本体喵~
- **--references <行:列>**：调查引用喵~ 找出这个玩具的各种名字喵~
- **--hover <行:列>**：悬停提示喵~ 凑数的东西喵~
- **--complete <行:列>**：补全建议喵~ 不想打字就用这个喵~ ~~（可能要打更多字）~~

## 搞半天想自己拼喵 (编程接口使用)
>（这里抄：[Meaoiu-LanguageServer](https://github.com/P-TNPC/Meaoiu-LanguageServer)）

想自己做抓板配件？真上进喵~ 那些 LSP 零件都把肚皮露出来了喵~
灵魂就在 `StateManager` 和 `ServiceState` 喵~

```typescript
import { StateManager, getDiagnostics, getFormattedCode } from 'meaoiu';

// 1. 拿出状态管理器喵
// true 表示行列号从 1 开始算，适合大多数人类喵
const stateManager = new StateManager(true);

// 2. 把你的小作文塞进去，伪装成文档状态喵
const docState = StateManager.makeDocState(233, "扒[='闲话'=]喵~");

// 3. 让管理器咬住文档状态，吐出服务状态喵
const serviceState = stateManager.useState(docState);

// 4. 开始压榨各种价值喵！

// 格式化代码喵 (格式化不需要传 ServiceState，直接传源码字符串喵)
const prettyCode = getFormattedCode('【#（偷懒）#]好不好？好喵~');

// 诊断代码，看语病喵
const { syntaxErrors, semanticErrors } = getDiagnostics(serviceState);

// 别的魔法喵 (定义引用查找、补全等都要传入 serviceState 和 行列位置)
import { getCompletions, findDefinition, getHoverInfo } from 'meaoiu';

// 注意你的光标位置喵
const pos = { line: 1, character: 4 }; // 对应 LSP 协议，传入的列号名为 character，输出的以实际为准（常用 col）

const completions = getCompletions(serviceState, pos);
const definition = findDefinition(serviceState, pos);
const hover = getHoverInfo(serviceState, pos);
```

有没有看懂喵？看不懂就去复读一百遍 `ServiceState` 的源码喵！

## 防误食小零件清单喵 (编程接口说明)

既然你诚心诚意地想知道每个零件怎么用，我就大发慈悲地告诉你喵~

### 灵魂玩具喵 (`StateManager` 与 `ServiceState`)

灵魂就是这两个东西喵~ 帮你节省脑细胞（电脑的）喵~

**`StateManager`** 负责记住你的小作文版本，减少重复解析喵~
- `constructor(useOnebased = true)`：`useOnebased` 为 `true` 时行列号从 1 开始数，适合人类喵；为 `false` 时从 0 开始，适合机器喵~
- `static makeDocState(version: number, sourceCode: string): DocState`：随便捏个文档状态玩具喵~ `version` 随便写个数字，变了就重新解析喵~
- `updateState(doc: DocState): ServiceState`：强行更新状态（不管版本变没变）喵~
- `useState(doc: DocState): ServiceState`：聪明地更新状态（版本变了才重新解析）喵~
- `getParseResult(doc: DocState): ParseResult | undefined` 和 `getAnalyzeResult(doc: DocState): AnalyzeResult | undefined`：直接掏缓存喵~

**`ServiceState`** 是一次解析的成果，包含抽象语法树和符号表喵~ 我不喜欢你 new 它喵，请让 `StateManager` 喂给你喵~
- `version: number`：文档版本号喵~
- `parseResult: ParseResult`：语法解析结果，里面有 `program`（AST 根节点）和 `errors`（语法错误）喵~
- `analyzeResult: AnalyzeResult`：符号分析结果，里面有 `rootScope`、`symbolMap`、`nodeScopeMap` 和 `errors`（语义错误）喵~

### 格式整理喵 (`getFormattedCode`)
```typescript
function getFormattedCode(sourceCode: string): string
```

- **请求参数**：`sourceCode` —— 你乱糟糟的小人乍丶一乂字符串喵~
- **响应格式**：整理好的小作文字符串喵~（缩进、换行、括号都会变漂亮喵）
- **使用示例**：
	```typescript
	import { getFormattedCode } from 'meaoiu';
	const pretty = getFormattedCode('扒【=零食＝]  吃~');
	console.log(pretty); // 输出 "扒[= 零食 =]吃~"
	```

### 静态诊断喵 (`getDiagnostics`)
```typescript
function getDiagnostics(serviceState: ServiceState): Diagnostics
```

- **请求参数**：`serviceState` —— [上面](#灵魂玩具喵-statemanager-与-servicestate)说过了喵~
- **响应格式**：`{ syntaxErrors: MeaoiuError[], semanticErrors: MeaoiuError[] }` 喵~
	- `syntaxErrors`：语法错误，比如括号不配对、关键词写错喵~
	- `semanticErrors`：语义错误，比如变量未定义、类型不匹配、重复声明喵~
- **使用示例**：
	```typescript
	import { getDiagnostics } from 'meaoiu';
	const { syntaxErrors, semanticErrors } = getDiagnostics(serviceState);
	syntaxErrors.forEach(err => console.error(`第 ${err.line} 行有语病喵：${err.message}`));
	```

### 补全建议喵 (`getCompletions`)
```typescript
function getCompletions(serviceState: ServiceState, position: { line: number; character: number }): Suggestion[]
```

- **请求参数**：
	- `serviceState`：上上面说过了喵~
	- `position`：光标位置喵~ `line` 和 `character` 的行列号取决于你构造 `StateManager` 时用的 `useOnebased` 喵~
- **响应格式**：`Suggestion[]`，每个建议有 `label`（显示的文本）和 `kind`（类型）喵~ `kind` 是 `SuggestionKind` 枚举值，对应 LSP 的 `CompletionItemKind` 喵~
- **使用示例**：
	```typescript
	import { getCompletions } from 'meaoiu';
	const suggestions = getCompletions(serviceState, { line: 2, character: 5 });
	suggestions.forEach(s => console.log(`可以补全 ${s.label} (种类 ${s.kind})`));
	```

### 定义追溯喵 (`findDefinition`)
```typescript
function findDefinition(serviceState: ServiceState, position: { line: number; character: number }): SymbolInfo | undefined
```

- **请求参数**：同上喵，光标位置喵~
- **响应格式**：`SymbolInfo` 或 `undefined`（没找到）喵~ `SymbolInfo` 包含名字、种类、类型、声明位置、引用位置等喵~
- **使用示例**：
	```typescript
	import { findDefinition } from 'meaoiu';
	const def = findDefinition(serviceState, { line: 3, character: 7 });
	if (def) console.log(`定义在 L${def.declarations[0]?.line}:${def.declarations[0]?.col}`));
	```

### 引用调查喵 (`findReferences`)
```typescript
function findReferences(serviceState: ServiceState, position: { line: number; character: number }): Identifier[]
```

- **请求参数**：光标位置喵~
- **响应格式**：`Identifier[]`，该符号的所有名字喵~ 每个 `Identifier` 都有 `line`、`col`、`endLine`、`endCol` 喵~
- **使用示例**：
	```typescript
	import { findReferences } from 'meaoiu';
	const refs = findReferences(serviceState, { line: 4, character: 2 });
	refs.forEach(ref => console.log(`在 L${ref.line}:${ref.col} 被提到`));
	```

### 悬停提示喵 (`getHoverInfo`)
```typescript
type HoverInfo = {
	contents: {
		kind: 'markdown';
		value: string;
	};
	range: Range;
};
function getHoverInfo(serviceState: ServiceState, position: { line: number; character: number }): HoverInfo | undefined
```

- **请求参数**：光标位置喵~
- **响应格式**：`HoverInfo` 或 `undefined`喵~ `HoverInfo` 包含 `contents.value`（内容）和 `range`（悬停范围）喵~
- **使用示例**：
	```typescript
	import { getHoverInfo } from 'meaoiu';
	const hover = getHoverInfo(serviceState, { line: 5, character: 9 });
	if (hover) console.log(`悬停内容：${hover.contents.value}`);
	```

### 语义高亮喵 (`getHighlightTokens` 和 `legend`)
```typescript
function getHighlightTokens(serviceState: ServiceState): HighlightToken[]
```

- **请求参数**：`serviceState` 喵~
- **响应格式**：`HighlightToken[]`，每个 token 包含 `line`、`col`、`length`、`tokenType`、`tokenModifiers` 喵~ 配合 `legend` 使用喵~
- **使用示例**：
	```typescript
	import { getHighlightTokens, legend } from 'meaoiu';
	const tokens = getHighlightTokens(serviceState);
	// legend.tokenTypes 和 legend.tokenModifiers 告诉你每个数字有何意味喵
	tokens.forEach(t => console.log(`在 L${t.line}:${t.col} 有类型 ${legend.tokenTypes[t.tokenType]}`));
	```

### 内联提示喵 (`getInlayHints`)
```typescript
function getInlayHints(serviceState: ServiceState): InlayHint[]
```

- **请求参数**：`serviceState` 喵~
- **响应格式**：`InlayHint[]`，每个提示有 `position`、`label`、`kind`、`paddingLeft`、`paddingRight` 喵~ `kind` 是 `InlayHintKind.Type` 或 `InlayHintKind.Parameter` 喵~
- **使用示例**：
	```typescript
	import { getInlayHints } from 'meaoiu';
	const hints = getInlayHints(serviceState);
	hints.forEach(h => console.log(`在 L${h.position.line}:${h.position.character} 显示 "${h.label}"`));
	```

### 执行喵 (`execute`)
让编好的喵谕跑起来喵~ 
```typescript
async function execute(
	sourceCode: string,
	ioConfig: {
		onPrint: (formattedString: string) => void;
		onPrompt: (question: string) => Promise<string>;
		styleize?: ((value: unknown, strValue: string) => string) | boolean;
	},
	options?: { useOnebased?: boolean, logLevel?: number },
): Promise<void>
```
- **请求参数**：
	- `ioConfig`：必须传入输入输出函数，可以设置样式，默认（`true`）用 ANSI 颜色输出喵~
	- `options`：决定报错用什么坐标和输出多少废话（0 debug 1 info 2 warn 3 error）喵~
- **使用示例**：
	```typescript
	import { execute } from 'meaoiu';
	import readline from 'node:readline';
	const ioConfig = {
		onPrint: console.log,
		onPrompt: question => {
			const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
			return new Promise(resolve => rl.question(question, answer => {
				rl.close();
				resolve(answer);
			}));
		},
		styleize: (value, strValue) => value == null ? `💥${strValue}💥` : strValue,
	};
	try {
		await execute("蹭饭~扒[=饭, '好了喵~'=]喵~", ioConfig, { useOnebased: true, logLevel: 3 });
		// 输出：💥空碗💥 好了喵~
	} catch (error) {
		console.error(`坏了喵：${error}`);
		process.exit(1);
	}
	```

### 小工具喵 (`rangeOf`)
```typescript
function rangeOf(location: { line: number; col: number; endLine: number; endCol: number }): Range
```
方便对接 LSP 协议喵~ `location` 可以是各种节点或错误喵~

### 符号表相关喵 (`SymbolKind`, `SymbolTag`, `SymbolInfo`, `Scope`)

这些是类型定义喵，你遇见 `SymbolInfo` 时会用到喵~

- `SymbolKind.FUNCTION`、`SymbolKind.VARIABLE`、`SymbolKind.PARAMETER`：符号种类喵~
- `SymbolTag.NORMAL`、`SymbolTag.MOVED`、`SymbolTag.DECAYED`：符号状态喵（移动语义相关）~
- `SymbolInfo`：符号的完整档案喵~
- `Scope`：作用域树节点喵~

### 重新示范一次喵

最后给你一个完整的组装示例喵：

```typescript
import {
	StateManager,
	getFormattedCode,
	getDiagnostics,
	getCompletions,
	findDefinition,
	findReferences,
	getHoverInfo,
	getHighlightTokens,
	getInlayHints,
	legend,
	SymbolKind
} from 'meaoiu';

// 1. 准备状态管理器
const stateManager = new StateManager(true);

// 2. 塞入你的大作
const doc = StateManager.makeDocState(1, `
蹭 a~ a 就是 1~
想要 [= x =] 加一 [# 叼回来 x - 1~ #]~
扒 [= 3 =] 加一~
`);

// 3. 获取服务状态
const serviceState = stateManager.useState(doc);

// 4. 格式化
console.log(getFormattedCode(doc.getText()));

// 5. 诊断
const diag = getDiagnostics(serviceState);
console.log('语法错误：', diag.syntaxErrors.length);
console.log('语义错误：', diag.semanticErrors.length);

// 6. 补全（假设光标在第 2 行第 3 列）
const completions = getCompletions(serviceState, { line: 2, character: 3 });
console.log('补全建议：', completions.map(c => c.label));

// 7. 定义查找（假设查找 "加一" 的定义）
const def = findDefinition(serviceState, { line: 3, character: 5 });
if (def?.kind === SymbolKind.FUNCTION) {
	console.log(`函数 "${def.name}" 定义在 L${def.declarations[0]?.line}`);
}

// 8. 引用查找
const refs = findReferences(serviceState, { line: 2, character: 3 });
console.log(`共有 ${refs.length} 处引用`);

// 9. 悬停
const hover = getHoverInfo(serviceState, { line: 1, character: 3 });
if (hover) console.log('悬停内容：', hover.contents.value);

// 10. 语义高亮
const tokens = getHighlightTokens(serviceState);
console.log(`生成了 ${tokens.length} 个高亮 token`);

// 11. 内联提示
const hints = getInlayHints(serviceState);
console.log(`生成了 ${hints.length} 个内联提示`);
```

好了喵，零件清单给你了，自己拼喵！拼坏了别来找我喵~
