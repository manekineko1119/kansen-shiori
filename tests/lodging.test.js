import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LODGING, lodgingDates, flightDates } from '../src/core/lodging.js';

test('LODGING: 宿泊の区分の一覧', () => {
  assert.deepEqual(LODGING, ['none', 'pre', 'post', 'both']);
});

test('lodgingDates: 前泊・後泊・前後泊・なし', () => {
  assert.deepEqual(lodgingDates('2026-11-21', 'pre'),  { checkIn: '2026-11-20', checkOut: '2026-11-21', nights: 1 });
  assert.deepEqual(lodgingDates('2026-11-21', 'post'), { checkIn: '2026-11-21', checkOut: '2026-11-22', nights: 1 });
  assert.deepEqual(lodgingDates('2026-11-21', 'both'), { checkIn: '2026-11-20', checkOut: '2026-11-22', nights: 2 });
  assert.equal(lodgingDates('2026-11-21', 'none'), null);
});

test('lodgingDates: 月末・年末をまたぐ', () => {
  assert.deepEqual(lodgingDates('2026-12-01', 'pre'),  { checkIn: '2026-11-30', checkOut: '2026-12-01', nights: 1 });
  assert.deepEqual(lodgingDates('2026-12-31', 'post'), { checkIn: '2026-12-31', checkOut: '2027-01-01', nights: 1 });
});

test('flightDates: 区分ごとの往路・復路', () => {
  assert.deepEqual(flightDates('2026-11-21', 'none'), { outbound: '2026-11-21', inbound: '2026-11-21' });
  assert.deepEqual(flightDates('2026-11-21', 'pre'),  { outbound: '2026-11-20', inbound: '2026-11-21' });
  assert.deepEqual(flightDates('2026-11-21', 'post'), { outbound: '2026-11-21', inbound: '2026-11-22' });
  assert.deepEqual(flightDates('2026-11-21', 'both'), { outbound: '2026-11-20', inbound: '2026-11-22' });
});

test('未知の宿泊の区分は例外', () => {
  assert.throws(() => lodgingDates('2026-11-21', 'xxx'));
  assert.throws(() => flightDates('2026-11-21', 'xxx'));
});
