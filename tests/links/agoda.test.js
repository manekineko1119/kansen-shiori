import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agodaUrl, parseAgodaArea } from '../../src/core/links/agoda.js';

test('region の検索URL', () => {
  assert.equal(agodaUrl({ area: { type: 'region', id: 831 }, checkIn: '2026-11-20', nights: 2 }),
    'https://www.agoda.com/ja-jp/search?region=831&checkIn=2026-11-20&los=2&rooms=1&adults=1&children=0');
});
test('city の検索URL', () => {
  assert.ok(agodaUrl({ area: { type: 'city', id: 5 }, checkIn: '2026-11-20', nights: 1 }).includes('?city=5&'));
});
test('エリア未登録ならトップ', () => {
  assert.equal(agodaUrl({ area: null, checkIn: '2026-11-20', nights: 1 }), 'https://www.agoda.com/ja-jp/');
});
test('URLからエリアを読む', () => {
  assert.deepEqual(parseAgodaArea('https://www.agoda.com/ja-jp/search?region=831&checkIn=2026-11-20'), { type: 'region', id: 831 });
  assert.deepEqual(parseAgodaArea('https://www.agoda.com/ja-jp/search?city=5'), { type: 'city', id: 5 });
  assert.equal(parseAgodaArea('https://www.agoda.com/ja-jp/'), null);
  assert.equal(parseAgodaArea('not a url'), null);
});
