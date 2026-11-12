// npm run sw-version：sw.js の事前キャッシュの一覧と指紋を今のファイルに合わせ、変わっていれば版を上げる（設計書 8章）
import { writeFileSync } from 'node:fs';
import { computeAssets, assetsHash, readSw } from './sw-assets.js';

const sw = readSw();
const assets = computeAssets();
const hash = assetsHash(assets);

if (hash === sw.hash && JSON.stringify(assets) === JSON.stringify(sw.assets)) {
  console.log(`変わっていません（版 ${sw.version}）`);
} else {
  // 版は「日本時間の日付.その日の連番」
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
  const [d, n] = (sw.version ?? '').split('.');
  const version = `${today}.${d === today ? Number(n) + 1 : 1}`;
  const list = `[\n${assets.map((p) => `  ${JSON.stringify(p)},`).join('\n').replace(/,$/, '')}\n]`;
  const text = sw.text
    .replace(/^const VERSION = '[^']*';$/m, `const VERSION = '${version}';`)
    .replace(/^const ASSETS_SHA256 = '[0-9a-f]*';$/m, `const ASSETS_SHA256 = '${hash}';`)
    .replace(/^const ASSETS = \[[\s\S]*?\];$/m, `const ASSETS = ${list};`);
  writeFileSync(new URL('../sw.js', import.meta.url), text);
  console.log(`版を ${sw.version} → ${version} にしました（${assets.length} ファイル）`);
}
