import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../../src/data/history.js';
import { fakeLocal } from '../helpers/fake-storage.js';

test('履歴は5件まで、重複は先頭に移る', () => {
  const h = createHistory(fakeLocal());
  assert.deepEqual(h.list(), []);
  for (const q of ['a', 'b', 'c', 'd', 'e', 'f', 'b']) h.push(q);
  assert.deepEqual(h.list(), ['b', 'f', 'e', 'd', 'c']);
});

test('壊れた値は捨てる', () => {
  assert.deepEqual(createHistory(fakeLocal({ 'kansen.history': '{"x":1}' })).list(), []);
  assert.deepEqual(createHistory(fakeLocal({ 'kansen.history': '[1,"a"]' })).list(), ['a']);
  assert.deepEqual(createHistory(fakeLocal({ 'kansen.history': 'こわれた' })).list(), []);
});

test('1件ずつ消せる。消したあとも順番はそのまま', () => {
  const h = createHistory(fakeLocal());
  for (const q of ['a', 'b', 'c']) h.push(q);
  assert.deepEqual(h.remove('b'), ['c', 'a']);
  assert.deepEqual(h.list(), ['c', 'a']);
  assert.deepEqual(h.remove('z'), ['c', 'a']);
});

test('壊れた値のときに消すと、空にする', () => {
  const local = fakeLocal({ 'kansen.history': 'こわれた' });
  assert.deepEqual(createHistory(local).remove('a'), []);
  assert.equal(local.getItem('kansen.history'), '[]');
});

test('保存に失敗しても、消したあとの一覧を返して落ちない', () => {
  const local = fakeLocal({ 'kansen.history': '["a","b"]' });
  local.setItem = () => { throw new Error('QuotaExceededError'); };
  const warn = console.warn; console.warn = () => {};
  try {
    assert.deepEqual(createHistory(local).remove('a'), ['b']);
  } finally { console.warn = warn; }
});
