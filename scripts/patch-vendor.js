// esm.sh から取った supabase-js の 1ファイル版（vendor/supabase-js.mjs）の先頭にある
// Node 用の部品の import 2行を、ブラウザの globalThis を見る2行に差し替える（vendor/README.md）。
// ブラウザでは process・Buffer がないので、supabase-js はブラウザ用の動き（btoa など）になる。
// 使い方：node scripts/patch-vendor.js   （版を上げたときに、取り直したファイルに対して1回実行する）

import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../vendor/supabase-js.mjs', import.meta.url);

const REPLACEMENTS = [
  ['import __Process$ from "/node/process.mjs";', 'const __Process$ = globalThis.process;'],
  ['import { Buffer as __Buffer$ } from "/node/buffer.mjs";', 'const __Buffer$ = globalThis.Buffer;'],
];

let src = readFileSync(file, 'utf8');
for (const [from, to] of REPLACEMENTS) {
  if (src.includes(to)) continue; // もう差し替えてある
  if (!src.includes(from)) throw new Error(`差し替える行が見つかりません：${from}`);
  src = src.replace(from, to);
}
writeFileSync(file, src);
console.log('vendor/supabase-js.mjs を差し替えました');
