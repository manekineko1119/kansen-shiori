import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_SCALE, MAX_SCALE, scaleOf, clampView, zoomAt, panBy, clientToSvg, viewBoxText } from '../src/core/map/zoom.js';

const full = { x: 0, y: 0, w: 300, h: 330 };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
const sameView = (a, b) => { for (const k of ['x', 'y', 'w', 'h']) close(a[k], b[k]); };

test('拡大の幅は 1〜8 倍', () => {
  assert.equal(MIN_SCALE, 1);
  assert.equal(MAX_SCALE, 8);
  assert.equal(scaleOf(full, full), 1);
  assert.equal(scaleOf({ x: 0, y: 0, w: 75, h: 82.5 }, full), 4);
});

test('clampView：8倍より大きく・1倍より小さくしない。地図の外に出さない', () => {
  sameView(clampView({ x: 0, y: 0, w: 10, h: 11 }, full), { x: 0, y: 0, w: 37.5, h: 41.25 });
  sameView(clampView({ x: -50, y: -50, w: 600, h: 660 }, full), full);
  sameView(clampView({ x: 290, y: -20, w: 150, h: 165 }, full), { x: 150, y: 0, w: 150, h: 165 });
  sameView(clampView({ x: -5, y: 400, w: 150, h: 165 }, full), { x: 0, y: 165, w: 150, h: 165 });
});

test('zoomAt：指の位置（地図の座標）は拡大しても同じ所に残る', () => {
  const v = zoomAt(full, full, 2, 60, 66);
  sameView(v, { x: 30, y: 33, w: 150, h: 165 });
  // 60 は v の中で、full の中と同じ割合（20%）の所にある
  close((60 - v.x) / v.w, 60 / 300);
});

test('zoomAt：8倍で止まり、縮めると1倍の全体に戻る', () => {
  let v = full;
  for (let i = 0; i < 10; i++) v = zoomAt(v, full, 2, 150, 165);
  close(scaleOf(v, full), 8);
  for (let i = 0; i < 10; i++) v = zoomAt(v, full, 0.5, 10, 10);
  sameView(v, full);
});

test('zoomAt：端の近くで拡大しても地図の外に出ない', () => {
  const v = zoomAt(full, full, 4, 299, 1);
  assert.ok(v.x >= 0 && v.x + v.w <= 300 + 1e-9);
  assert.ok(v.y >= 0 && v.y + v.h <= 330 + 1e-9);
});

test('panBy：地図の座標で動かす。1倍のときは動かない。端で止まる', () => {
  sameView(panBy(full, full, 30, 30), full);
  const z = { x: 100, y: 100, w: 75, h: 82.5 };
  sameView(panBy(z, full, 10, -20), { x: 90, y: 120, w: 75, h: 82.5 });
  sameView(panBy(z, full, 500, 500), { x: 0, y: 0, w: 75, h: 82.5 });
});

test('clientToSvg：画面の位置を地図の座標にする（縦横の比が違うときは真ん中に寄せた分を引く）', () => {
  // 幅 600・高さ 660 の箱にそのまま入る（2倍で表示）
  assert.deepEqual(clientToSvg(full, { left: 10, top: 20, width: 600, height: 660 }, 310, 350), [150, 165]);
  // 高さが足りないとき（max-height）：高さ 330 で 1倍、横に 135 ずつ余白
  assert.deepEqual(clientToSvg(full, { left: 0, top: 0, width: 570, height: 330 }, 135, 0), [0, 0]);
  assert.deepEqual(clientToSvg(full, { left: 0, top: 0, width: 570, height: 330 }, 435, 330), [300, 330]);
  // 拡大しているときは、見ている範囲の中の座標になる
  assert.deepEqual(clientToSvg({ x: 100, y: 50, w: 150, h: 165 }, { left: 0, top: 0, width: 300, height: 330 }, 150, 165), [175, 132.5]);
});

test('viewBoxText：SVG の viewBox の文字にする', () => {
  assert.equal(viewBoxText({ x: 1.5, y: 2, w: 75, h: 82.5 }), '1.5 2 75 82.5');
});
