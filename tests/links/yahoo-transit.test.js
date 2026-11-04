import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yahooTransitUrl } from '../../src/core/links/yahoo-transit.js';

const BASE = 'https://transit.yahoo.co.jp/search/result?from=%E6%9D%BE%E6%9C%AC&to=%E5%B2%90%E9%98%9C';

test('到着時刻つき：到着時刻指定（type=4）のURLになる', () => {
  assert.equal(
    yahooTransitUrl({ from: '松本', to: '岐阜', date: '2026-11-21', arriveTime: '12:30' }),
    `${BASE}&y=2026&m=11&d=21&hh=12&m1=3&m2=0&type=4`,
  );
});

test('1桁の月日はそのまま渡す（m=3&d=5 でも開くことを設計書 6章で確認済み）', () => {
  assert.equal(
    yahooTransitUrl({ from: '松本', to: '岐阜', date: '2027-03-05', arriveTime: '12:30' }),
    `${BASE}&y=2027&m=3&d=5&hh=12&m1=3&m2=0&type=4`,
  );
});

test('1桁の時は先頭の0を付けない', () => {
  assert.equal(
    yahooTransitUrl({ from: '松本', to: '岐阜', date: '2027-03-05', arriveTime: '09:05' }),
    `${BASE}&y=2027&m=3&d=5&hh=9&m1=0&m2=5&type=4`,
  );
});

test('キックオフ未定（arriveTime が null）：その日の9:00出発の形になる', () => {
  assert.equal(
    yahooTransitUrl({ from: '松本', to: '岐阜', date: '2027-03-05', arriveTime: null }),
    `${BASE}&y=2027&m=3&d=5&hh=9&m1=0&m2=0`,
  );
});
