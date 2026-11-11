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
