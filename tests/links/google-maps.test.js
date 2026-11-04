import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapsDirectionsUrl, mapsSearchUrl, restaurantQuery } from '../../src/core/links/google-maps.js';

test('経路：出発地ありの車', () => {
  assert.equal(
    mapsDirectionsUrl({ origin: '松本駅', lat: 35.4, lng: 136.7, travelmode: 'driving' }),
    'https://www.google.com/maps/dir/?api=1&origin=%E6%9D%BE%E6%9C%AC%E9%A7%85&destination=35.4%2C136.7&travelmode=driving',
  );
});

test('経路：出発地が null なら origin を省く（現在地）', () => {
  assert.equal(
    mapsDirectionsUrl({ origin: null, lat: 35.4, lng: 136.7, travelmode: 'transit' }),
    'https://www.google.com/maps/dir/?api=1&destination=35.4%2C136.7&travelmode=transit',
  );
});

test('飲食店の検索語：スタジアム名 + 周辺 飲食店', () => {
  assert.equal(restaurantQuery('岐阜メモリアルセンター長良川競技場'), '岐阜メモリアルセンター長良川競技場 周辺 飲食店');
});

test('検索URL：query に空白と日本語がエンコードされる', () => {
  const url = mapsSearchUrl({ query: restaurantQuery('長良川競技場') });
  assert.ok(url.startsWith('https://www.google.com/maps/search/?api=1&query='));
  assert.equal(new URL(url).searchParams.get('query'), '長良川競技場 周辺 飲食店');
});

test('経路：出発地が undefined でも origin を省く', () => {
  assert.equal(
    mapsDirectionsUrl({ lat: 35.4, lng: 136.7, travelmode: 'transit' }),
    mapsDirectionsUrl({ origin: null, lat: 35.4, lng: 136.7, travelmode: 'transit' }),
  );
});
