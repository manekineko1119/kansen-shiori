// Service Worker の事前キャッシュの一覧と版の指紋（設計書 8章）。tests/sw.test.js と scripts/sw-version.js の両方から使う
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT));
const BINARY = /\.(png|jpe?g)$/;

// ファイルから参照される同じアプリのファイル。取りこぼさないよう、import の書き方を読み分けずに、
// JS は相対パスの .js・.mjs の文字列をすべて（静的・動的な import、export from。コメントの中も拾うが、多い分には害がない）、
// CSS は url() の相対パスを拾う。'./icons/…' はページ（index.html）から数える（画面が img の src に入れるため）
export function refsOf(path, text) {
  const dir = posix.dirname(path);
  const join = (spec) => posix.normalize(posix.join(dir, spec));
  const refs = [];
  if (/\.m?js$/.test(path)) {
    for (const m of text.matchAll(/['"](\.{1,2}\/[^'"\s]+\.m?js)['"]/g)) {
      if (m[1] === './sw.js') continue; // Service Worker の登録先（ページから数える。sw.js 自身は事前キャッシュしない）
      refs.push(join(m[1]));
    }
    for (const m of text.matchAll(/['"]\.\/(icons\/[\w.-]+)['"]/g)) refs.push(m[1]);
  } else if (/\.css$/.test(path)) {
    for (const m of text.matchAll(/url\(\s*['"]?(\.{1,2}\/[^'")\s]+)['"]?\s*\)/g)) refs.push(join(m[1]));
  }
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
    if (/\.(m?js|css)$/.test(p)) queue.push(...refsOf(p, read(p).toString('utf8')));
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
