import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// vendor/supabase-js.mjs は esm.sh の 1ファイル版の先頭2行を差し替えたもの（vendor/README.md）
const url = new URL('../vendor/supabase-js.mjs', import.meta.url);
const src = readFileSync(url, 'utf8');
const readme = readFileSync(new URL('../vendor/README.md', import.meta.url), 'utf8');

test('外のファイルを読まない（import が残っていない）', () => {
  assert.doesNotMatch(src, /^\s*import[\s{*]/m);
  assert.doesNotMatch(src, /\bimport\(/);
  assert.doesNotMatch(src, /from\s*["']\//);
});

test('Node 用の部品の import を、ブラウザの globalThis を見る2行に差し替えてある', () => {
  assert.match(src, /^const __Process\$ = globalThis\.process;$/m);
  assert.match(src, /^const __Buffer\$ = globalThis\.Buffer;$/m);
});

test('createClient を export している', () => {
  assert.match(src, /export\s*\{[^}]*\bcreateClient\b/);
});

test('README に今のファイルの SHA-256 が書いてある', () => {
  const sha = createHash('sha256').update(readFileSync(url)).digest('hex');
  assert.match(readme, new RegExp(sha));
});

test('MIT のライセンスの文を置いてある', () => {
  const license = readFileSync(new URL('../vendor/LICENSE-supabase-js.txt', import.meta.url), 'utf8');
  assert.match(license, /MIT License/);
  assert.match(license, /Supabase/);
});
