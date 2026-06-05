import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import packageJson from './package.json' with { type: 'json' };
const { version } = packageJson;
const placeholder = '__MEAOIU_VERSION__';

try {
	let usedVer = '';
	const mainJs = path.resolve(import.meta.dirname, 'dist/cli/main.js');
	const content = (await readFile(mainJs, 'utf-8')).replace(placeholder, () => (usedVer = version));
	if (!usedVer) throw new Error(`文件中没有 ${placeholder} 标记`);
	await writeFile(mainJs, content, 'utf-8');
	console.log(`\x1b[32m✓ 版本号 ${usedVer} 已成功注入编译产物\x1b[0m`);
} catch (err) {
	if (!(err instanceof Error)) throw err;
	console.error(`\x1b[31m✗ 版本号注入失败：${err.message}\x1b[0m`);
	process.exit(1);
}
