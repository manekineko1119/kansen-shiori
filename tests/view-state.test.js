import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createViewState, routeKey } from '../src/ui/view-state.js';
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
