import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, addMinutes, compareDateTime, jstNow, diffMinutes,
  arrivalTarget, matchEndEstimate, MATCH_DURATION_MIN,
} from '../src/core/time.js';

test('addDays: 年末・年始・うるう年・平年の2月をまたぐ', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2027-01-01', -1), '2026-12-31');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2027-02-28', 1), '2027-03-01');
});

test('addMinutes: 日付をまたいで足し引きする', () => {
  assert.deepEqual(addMinutes({ date: '2026-12-31', time: '23:30' }, 45), { date: '2027-01-01', time: '00:15' });
  assert.deepEqual(addMinutes({ date: '2026-11-21', time: '00:10' }, -20), { date: '2026-11-20', time: '23:50' });
});

test('jstNow: UTC を日本時間（+9時間）に直す', () => {
  assert.deepEqual(jstNow(Date.UTC(2026, 10, 1, 15, 30)), { date: '2026-11-02', time: '00:30' });
  assert.deepEqual(jstNow(Date.UTC(2026, 10, 1, 14, 59)), { date: '2026-11-01', time: '23:59' });
});

test('arrivalTarget: キックオフの何分前に着くかを逆算する', () => {
  assert.deepEqual(arrivalTarget('2026-11-21', '14:00', 90), { date: '2026-11-21', time: '12:30' });
  assert.deepEqual(arrivalTarget('2026-11-21', '00:30', 90), { date: '2026-11-20', time: '23:00' });
  assert.deepEqual(arrivalTarget('2026-11-21', '14:00', 0), { date: '2026-11-21', time: '14:00' });
});

test('arrivalTarget: キックオフ未定なら null', () => {
  assert.equal(arrivalTarget('2026-11-21', null, 90), null);
});

test('matchEndEstimate: キックオフの120分後', () => {
  assert.equal(MATCH_DURATION_MIN, 120);
  assert.deepEqual(matchEndEstimate('2026-12-31', '23:00'), { date: '2027-01-01', time: '01:00' });
  assert.equal(matchEndEstimate('2026-11-21', null), null);
});

test('compareDateTime: 早い・同じ・遅いを -1 / 0 / 1 で返す', () => {
  assert.equal(compareDateTime({ date: '2026-11-21', time: '12:30' }, { date: '2026-11-21', time: '12:31' }), -1);
  assert.equal(compareDateTime({ date: '2026-11-21', time: '12:30' }, { date: '2026-11-21', time: '12:30' }), 0);
  assert.equal(compareDateTime({ date: '2026-11-22', time: '00:00' }, { date: '2026-11-21', time: '23:59' }), 1);
});

test('diffMinutes: b − a を分で返す', () => {
  assert.equal(diffMinutes({ date: '2026-11-21', time: '23:30' }, { date: '2026-11-22', time: '00:10' }), 40);
  assert.equal(diffMinutes({ date: '2026-11-22', time: '00:10' }, { date: '2026-11-21', time: '23:30' }), -40);
});
