import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDateJa, formatDateLong, daysUntil, formatYen, minutesText } from '../src/core/format.js';

test('日付：曜日つき', () => {
  assert.equal(formatDateJa('2026-10-25'), '10/25（日）');
  assert.equal(formatDateLong('2027-02-28'), '2027/2/28（日）');
});

test('あと何日：月末・年末をまたぐ', () => {
  assert.equal(daysUntil('2026-11-14', '2026-11-11'), 3);
  assert.equal(daysUntil('2027-01-01', '2026-12-31'), 1);
  assert.equal(daysUntil('2026-11-11', '2026-11-11'), 0);
});

test('円と分', () => {
  assert.deepEqual([12300, 0, null].map(formatYen), ['12,300円', '0円', '－']);
  assert.deepEqual([50, 60, 200].map(minutesText), ['50分', '1時間', '3時間20分']);
});
