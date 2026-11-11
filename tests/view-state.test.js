import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createViewState, routeKey, sameUserId, scrollPlan } from '../src/ui/view-state.js';
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

test('hasScroll：記録した位置があるか（0 でも記録していれば true）', () => {
  const s = createViewState();
  assert.equal(s.hasScroll('a'), false);
  s.setScroll('a', 0);
  assert.equal(s.hasScroll('a'), true);
  s.clearAll();
  assert.equal(s.hasScroll('a'), false);
});

test('scrollPlan：S は残っていれば restore、なければ top', () => {
  const list = parseRoute('#/fixtures');
  const detail = parseRoute('#/fixtures?f=a');
  assert.equal(scrollPlan({ prev: detail, next: list, size: 'S', hasSaved: true }), 'restore');
  assert.equal(scrollPlan({ prev: list, next: detail, size: 'S', hasSaved: false }), 'top');
  assert.equal(scrollPlan({ prev: list, next: parseRoute('#/fixtures?f=b'), size: 'S', hasSaved: false }), 'top');
});

test('scrollPlan：M・L は同じ画面で query だけ違うなら keep、それ以外は restore か top', () => {
  const a = parseRoute('#/fixtures?f=a');
  const b = parseRoute('#/fixtures?f=b');
  for (const size of ['M', 'L']) {
    assert.equal(scrollPlan({ prev: a, next: b, size, hasSaved: true }), 'keep');
    assert.equal(scrollPlan({ prev: a, next: b, size, hasSaved: false }), 'keep');
    assert.equal(scrollPlan({ prev: a, next: parseRoute('#/calendar'), size, hasSaved: true }), 'restore');
    assert.equal(scrollPlan({ prev: a, next: parseRoute('#/calendar'), size, hasSaved: false }), 'top');
  }
  // params が違えば（遠征予定 A → B）keep しない
  assert.equal(scrollPlan({ prev: parseRoute('#/trips/1'), next: parseRoute('#/trips/2'), size: 'M', hasSaved: false }), 'top');
  // 最初の描画（prev なし）
  assert.equal(scrollPlan({ prev: null, next: a, size: 'M', hasSaved: false }), 'top');
});

test('写真の再アップロードの状態：置く・取り出す・消す。描き直しても同じキーで取り出せる（6-7 のレビュー）', () => {
  const s = createViewState();
  assert.equal(s.getPhotoRetry('k'), null);
  const file = { name: 'a.jpg' };
  s.setPhotoRetry('k', { file, message: '写真をアップロードできませんでした' });
  assert.deepEqual(s.getPhotoRetry('k'), { file, message: '写真をアップロードできませんでした' });
  assert.equal(s.getPhotoRetry('k').file, file); // 同じ File（コピーしない）
  assert.equal(s.getPhotoRetry('other'), null);
  s.clearPhotoRetry('k');
  assert.equal(s.getPhotoRetry('k'), null);
});

test('写真の再アップロードの状態：clearForm では消えず、利用者が変わる clearAll で消える（別の人が取り出せない）', () => {
  const s = createViewState();
  s.setPhotoRetry('k', { file: {}, message: 'm' });
  s.clearForm('k');
  assert.notEqual(s.getPhotoRetry('k'), null);
  s.clearAll();
  assert.equal(s.getPhotoRetry('k'), null);
});
