import { test } from 'node:test';
import assert from 'node:assert/strict';
import { project, isInset, INSET, MAIN, VIEWBOX } from '../src/core/map/project.js';

test('VIEWBOX と定数', () => {
  assert.equal(VIEWBOX, '0 0 300 330');
  assert.equal(MAIN.lng0, 128);
  assert.equal(INSET.w, 84);
});

test('アルウィンは本土の枠の中', () => {
  assert.equal(isInset(36.18, 137.917), false);
  const [x, y] = project(36.18, 137.917);
  assert.ok(x >= 0 && x <= 300);
  assert.ok(y >= 0 && y <= 330);
});

test('沖縄の会場は挿入枠の中', () => {
  assert.equal(isInset(26.309, 127.825), true);
  const [x, y] = project(26.309, 127.825);
  assert.ok(x >= 8 && x <= 92, `x=${x}`);
  assert.ok(y >= 8 && y <= 72, `y=${y}`);
});

test('白波スタジアム（鹿児島）は挿入枠ではない', () => {
  assert.equal(isInset(31.565, 130.56), false);
});

test('小数は2桁に丸める', () => {
  const [x, y] = project(36.18, 137.917);
  assert.equal(x, Math.round(x * 100) / 100);
  assert.equal(y, Math.round(y * 100) / 100);
});
