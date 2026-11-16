import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { JAPAN_SHAPE, ATTRIBUTION } from '../src/core/map/japan-shape.js';
import { project } from '../src/core/map/project.js';
import { TOYOKO_PREFECTURE_CODES } from '../src/core/links/toyoko-inn.js';

/** d の数字から外接する四角を求める */
function bbox(d) {
  const n = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i + 1 < n.length; i += 2) {
    minX = Math.min(minX, n[i]); maxX = Math.max(maxX, n[i]);
    minY = Math.min(minY, n[i + 1]); maxY = Math.max(maxY, n[i + 1]);
  }
  return { minX, minY, maxX, maxY };
}

test('47都道府県が番号順にそろい、名前が東横インの表と一致する', () => {
  const list = JAPAN_SHAPE.prefectures;
  assert.equal(list.length, 47);
  list.forEach((p, i) => {
    assert.equal(p.code, i + 1);
    assert.equal(TOYOKO_PREFECTURE_CODES[p.name], p.code);
    assert.match(p.d, /^M[\d.,LMZ -]+Z$/);
  });
  assert.equal(JAPAN_SHAPE.viewBox, '0 0 300 330');
  assert.deepEqual(JAPAN_SHAPE.inset, { x: 8, y: 8, w: 84, h: 64 });
});

test('japan-shape.js は150KB以下', () => {
  const size = statSync(new URL('../src/core/map/japan-shape.js', import.meta.url)).size;
  assert.ok(size <= 150 * 1024, `size=${size}`);
});

test('会場の点が、その都道府県の外接する四角の中に入る', () => {
  const cases = [
    ['アルウィン', 36.18, 137.917, '長野県'],
    ['国立', 35.678, 139.715, '東京都'],
    ['プレミストドーム', 43.015, 141.41, '北海道'],
    ['沖縄の会場', 26.309, 127.825, '沖縄県'],
  ];
  for (const [label, lat, lng, name] of cases) {
    const pref = JAPAN_SHAPE.prefectures.find((p) => p.name === name);
    const b = bbox(pref.d);
    const [x, y] = project(lat, lng);
    assert.ok(x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY,
      `${label}: (${x},${y}) not in ${JSON.stringify(b)}`);
  }
});

test('出典の表記', () => {
  assert.equal(ATTRIBUTION, 'Made with Natural Earth.');
});
function points(d) {
  const n = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const out = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]);
  return out;
}

test('沖縄県のすべての点が挿入枠の中、ほかの都道府県のすべての点が viewBox の中', () => {
  const { x, y, w, h } = JAPAN_SHAPE.inset;
  for (const p of JAPAN_SHAPE.prefectures) {
    for (const [px, py] of points(p.d)) {
      if (p.name === '沖縄県') {
        assert.ok(px >= x && px <= x + w && py >= y && py <= y + h, `沖縄県 (${px},${py})`);
      } else {
        assert.ok(px >= 0 && px <= 300 && py >= 0 && py <= 330, `${p.name} (${px},${py})`);
      }
    }
  }
});
