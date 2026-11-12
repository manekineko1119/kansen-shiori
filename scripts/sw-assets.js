// Service Worker の事前キャッシュの一覧と版の指紋（設計書 8章）。tests/sw.test.js と scripts/sw-version.js の両方から使う
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT));
const BINARY = /\.(png|jpe?g)$/;

// JS の import（静的）とアイコンの参照をたどる
function jsRefs(path, text) {
  const dir = posix.dirname(path);
  const refs = [];
  for (const m of text.matchAll(/(?:^|[\s;}])(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm)) {
    const spec = m[1] ?? m[2];
    if (spec.startsWith('.')) refs.push(posix.normalize(posix.join(dir, spec)));
  }
  // 画面から読むアイコン（例：'./icons/icon.svg'）。パスはページ（index.html）から数える
  for (const m of text.matchAll(/['"]\.\/(icons\/[\w.-]+)['"]/g)) refs.push(m[1]);
  return refs;
}

// index.html から読むもの（link・script）と manifest のアイコンから始め、JS の import をたどった一覧（並べ替え済み）
export function computeAssets() {
  const html = read('index.html').toString('utf8');
  const start = ['index.html', 'manifest.webmanifest'];
  for (const m of html.matchAll(/<(?:link|script)\b[^>]*\b(?:href|src)="\.\/([^"]+)"/g)) start.push(m[1]);
  const manifest = JSON.parse(read('manifest.webmanifest').toString('utf8'));
  for (const icon of manifest.icons) start.push(icon.src);

  const seen = new Set();
  const queue = [...start];
  while (queue.length) {
    const p = queue.shift();
    if (seen.has(p)) continue;
    if (!existsSync(new URL(p, ROOT))) throw new Error(`見つからないファイル：${p}`);
    seen.add(p);
    if (/\.m?js$/.test(p)) queue.push(...jsRefs(p, read(p).toString('utf8')));
  }
  return [...seen].sort();
}

// 一覧のファイルの中身からの SHA-256（文字のファイルは改行を LF にそろえる）
export function assetsHash(assets) {
  const h = createHash('sha256');
  for (const p of [...assets].sort()) {
    const buf = read(p);
    h.update(p).update('\0');
    h.update(BINARY.test(p) ? buf : Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8'));
    h.update('\0');
  }
  return h.digest('hex');
}

// sw.js に書いてある版・指紋・一覧
export function readSw() {
  const text = read('sw.js').toString('utf8');
  const version = text.match(/^const VERSION = '([^']+)';$/m)?.[1];
  const hash = text.match(/^const ASSETS_SHA256 = '([0-9a-f]*)';$/m)?.[1];
  const list = text.match(/^const ASSETS = (\[[\s\S]*?\]);$/m)?.[1];
  return { text, version, hash, assets: list ? JSON.parse(list) : null };
}
