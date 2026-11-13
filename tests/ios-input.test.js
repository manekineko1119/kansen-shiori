import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// iPhone の Safari の入力欄（設計書 8.1。7-6 の実機の確認で見つけた）
const parts = readFileSync(new URL('../src/ui/styles/parts.css', import.meta.url), 'utf8');
const rule = (sel) => {
  const i = parts.indexOf(`${sel} {`);
  assert.ok(i >= 0, `${sel} の指定がない`);
  return parts.slice(i, parts.indexOf('}', i));
};

test('入力欄の文字は 16px（Safari は 16px 未満の欄をタップすると拡大する）', () => {
  assert.match(rule('.input'), /font-size:\s*16px/);
});

test('日付・時刻の欄は、Safari の最小の幅を外して枠に収める（2列で重ならない）', () => {
  const r = rule('input[type="date"].input, input[type="time"].input');
  assert.match(r, /min-width:\s*0/);
  assert.match(r, /-webkit-appearance:\s*none/);
  assert.match(r, /appearance:\s*none/);
});
