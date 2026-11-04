import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHalfWidth, normalizeName } from '../../supabase/functions/_shared/text.js';

test('toHalfWidth: 全角の英数字・空白を半角にする', () => {
  assert.equal(toHalfWidth('松本山雅ＦＣ　ｖｓ　１２'), '松本山雅FC vs 12');
});

test('toHalfWidth: 全角記号を半角にし、日本語はそのまま', () => {
  assert.equal(toHalfWidth('（Ａ－Ｂ）／ｃ：１'), '(A-B)/c:1');
  assert.equal(toHalfWidth('ホーム'), 'ホーム');
});

test('normalizeName: 全角・大文字・前後と途中の空白をそろえる', () => {
  assert.equal(normalizeName(' ＦＣ岐阜 '), 'fc岐阜');
  assert.equal(normalizeName('松本山雅　ＦＣ'), '松本山雅fc');
  assert.equal(normalizeName('松本山雅FC'), normalizeName('松本山雅ＦＣ'));
});
