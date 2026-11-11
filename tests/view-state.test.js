import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createViewState, routeKey, sameUserId } from '../src/ui/view-state.js';
import { parseRoute } from '../src/core/route.js';

test('入力中の値は画面ごとに分かれ、返した値を書き換えても中身は変わらない', () => {
  const s = createViewState();
  assert.deepEqual(s.getForm('k1'), {});
  assert.equal(s.getScroll('k1'), 0);
  s.setForm('k1', { memo: 'あ' });
  const got = s.getForm('k1');
  got.memo = 'い';
  assert.deepEqual(s.getForm('k1'), { memo: 'あ' });
  s.setForm('k2', { memo: 'う' });
  assert.deepEqual(s.getForm('k1'), { memo: 'あ' });
});

test('渡した値を後から書き換えても中身は変わらない', () => {
  const s = createViewState();
  const v = { memo: 'あ' };
  s.setForm('k1', v);
  v.memo = 'え';
  assert.deepEqual(s.getForm('k1'), { memo: 'あ' });
});

test('スクロール位置は画面ごとに覚える', () => {
  const s = createViewState();
  s.setScroll('k1', 640);
  assert.equal(s.getScroll('k1'), 640);
  assert.equal(s.getScroll('k2'), 0);
});

test('routeKey：同じ画面・同じ項目なら同じ値、違えば違う値', () => {
  assert.equal(routeKey(parseRoute('#/trips/a')), routeKey(parseRoute('#/trips/a')));
  assert.notEqual(routeKey(parseRoute('#/trips/a')), routeKey(parseRoute('#/trips/b')));
  assert.notEqual(routeKey(parseRoute('#/result?f=x')), routeKey(parseRoute('#/result?f=y')));
  assert.notEqual(routeKey(parseRoute('#/trips')), routeKey(parseRoute('#/records')));
});

test('clearForm：入力を消す', () => {
  const s = createViewState();
  s.setForm('k1', { memo: 'あ' });
  s.clearForm('k1');
  assert.deepEqual(s.getForm('k1'), {});
});

test('clearAll：入力とスクロール位置を全部消す', () => {
  const s = createViewState();
  s.setForm('a', { x: '1' });
  s.setForm('b', { y: '2' });
  s.setScroll('a', 300);
  s.clearAll();
  assert.deepEqual(s.getForm('a'), {});
  assert.deepEqual(s.getForm('b'), {});
  assert.equal(s.getScroll('a'), 0);
});

test('sameUserId：ID が同じなら同じ人（offline・管理者の違いは無視）、未ログインは null どうし', () => {
  assert.equal(sameUserId(null, null), true);
  assert.equal(sameUserId(undefined, null), true);
  assert.equal(sameUserId({ id: 'a' }, { id: 'a', isAdmin: true, offline: true }), true);
  assert.equal(sameUserId({ id: 'a' }, { id: 'b' }), false);
  assert.equal(sameUserId({ id: 'a' }, null), false);
  assert.equal(sameUserId(null, { id: 'a' }), false);
});
