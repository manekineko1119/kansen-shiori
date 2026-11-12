import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPendingInput, PENDING_INPUT_MAX_AGE_MS } from '../../src/data/pending-input.js';
import { fakeLocal } from '../helpers/fake-storage.js';

const T0 = Date.UTC(2026, 10, 12, 3, 0);

test('期限切れの入力：同じ利用者なら1回だけ戻し、読んだら消す', () => {
  const store = fakeLocal();
  const p = createPendingInput({ storage: () => store });
  p.save({ userId: 'u1', key: 'K', values: { memo: '長い感想' }, nowMs: T0 });
  assert.deepEqual(p.take({ userId: 'u1', nowMs: T0 + 60_000 }), { key: 'K', values: { memo: '長い感想' } });
  assert.equal(p.take({ userId: 'u1', nowMs: T0 + 60_000 }), null);
  assert.equal(store._map.size, 0);
});

test('期限切れの入力：別の利用者・古すぎる・壊れた値は戻さずに消す', () => {
  const store = fakeLocal();
  const p = createPendingInput({ storage: () => store });
  p.save({ userId: 'u1', key: 'K', values: { memo: 'x' }, nowMs: T0 });
  assert.equal(p.take({ userId: 'u2', nowMs: T0 }), null);
  assert.equal(store._map.size, 0);
  p.save({ userId: 'u1', key: 'K', values: { memo: 'x' }, nowMs: T0 });
  assert.equal(p.take({ userId: 'u1', nowMs: T0 + PENDING_INPUT_MAX_AGE_MS + 1 }), null);
  store.setItem('kansen.pendingInput', '{壊れた');
  assert.equal(p.take({ userId: 'u1', nowMs: T0 }), null);
  assert.equal(store._map.size, 0);
});

test('期限切れの入力：空の入力・利用者なしは置かない', () => {
  const store = fakeLocal();
  const p = createPendingInput({ storage: () => store });
  p.save({ userId: 'u1', key: 'K', values: {}, nowMs: T0 });
  p.save({ userId: null, key: 'K', values: { memo: 'x' }, nowMs: T0 });
  assert.equal(store._map.size, 0);
});

test('期限切れの入力：保存領域が使えなくても止まらない', () => {
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  const p = createPendingInput({ storage: () => broken });
  p.save({ userId: 'u1', key: 'K', values: { memo: 'x' }, nowMs: T0 });
  assert.equal(p.take({ userId: 'u1', nowMs: T0 }), null);
  const none = createPendingInput({ storage: () => { throw new Error('no sessionStorage'); } });
  assert.equal(none.take({ userId: 'u1', nowMs: T0 }), null);
});
