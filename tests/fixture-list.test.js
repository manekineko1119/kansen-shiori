import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureRows, nearestIndex, shouldJumpToToday } from '../src/core/fixture-list.js';
import { jstNow } from '../src/core/time.js';

const clubsById = {
  matsumoto: { id: 'matsumoto', short_name: '松本' }, gifu: { id: 'gifu', short_name: '岐阜' },
  nara: { id: 'nara', short_name: '奈良' }, ryukyu: { id: 'ryukyu', short_name: '琉球' },
};
const env = { supportClubId: 'matsumoto', clubsById };
const fx = (id, date, home, away, extra = {}) => ({
  id, match_date: date, kickoff: '14:00', home_club_id: home, away_club_id: away, status: 'scheduled', home_score: null, away_score: null, ...extra,
});

test('応援クラブの試合だけを日付順に並べ、キックオフ未定は同じ日の最後', () => {
  const rows = fixtureRows([
    fx('c', '2026-11-22', 'ryukyu', 'matsumoto'),
    fx('x', '2026-11-08', 'gifu', 'nara'),
    fx('b', '2026-11-08', 'matsumoto', 'gifu', { kickoff: null }),
    fx('a', '2026-11-08', 'nara', 'matsumoto', { kickoff: '13:00' }),
  ], env);
  assert.deepEqual(rows.map((r) => r.id), ['a', 'b', 'c']);
  assert.deepEqual(rows.map((r) => [r.side, r.opponent, r.kickoffText]), [['A', '奈良', '13:00'], ['H', '岐阜', '未定'], ['A', '琉球', '14:00']]);
  assert.equal(rows[1].kickoff, null);
});

test('終わった試合は結果の色（outcome）とスコア（応援クラブ－相手）', () => {
  const [home, away] = fixtureRows([
    fx('h', '2026-11-01', 'matsumoto', 'gifu', { status: 'finished', home_score: 2, away_score: 1 }),
    fx('a', '2026-11-08', 'gifu', 'matsumoto', { status: 'finished', home_score: 2, away_score: 2 }),
  ], env);
  assert.deepEqual([home.outcome, home.score, home.mark, home.finished], ['win', '2-1', '', true]);
  assert.deepEqual([away.outcome, away.score, away.mark], ['draw', '2-2', '']);
});

test('スコア未登録・延期・中止は印を付ける', () => {
  const rows = fixtureRows([
    fx('1', '2026-11-01', 'matsumoto', 'gifu', { status: 'finished' }),
    fx('2', '2026-11-02', 'matsumoto', 'gifu', { status: 'postponed' }),
    fx('3', '2026-11-03', 'matsumoto', 'gifu', { status: 'cancelled' }),
    fx('4', '2026-11-04', 'matsumoto', 'gifu'),
  ], env);
  assert.deepEqual(rows.map((r) => r.mark), ['結果未登録', '延期', '試合中止', '']);
  assert.deepEqual(rows.map((r) => [r.outcome, r.score]), [[null, null], [null, null], [null, null], [null, null]]);
});

test('nearestIndex：今日以降で最初の行。全部過ぎていれば最後、空なら -1', () => {
  const rows = fixtureRows([
    fx('1', '2026-11-01', 'matsumoto', 'gifu'), fx('2', '2026-11-08', 'gifu', 'matsumoto'), fx('3', '2026-11-15', 'matsumoto', 'nara'),
  ], env);
  assert.equal(nearestIndex(rows, '2026-11-08'), 1);
  assert.equal(nearestIndex(rows, '2026-11-09'), 2);
  assert.equal(nearestIndex(rows, '2026-10-01'), 0);
  assert.equal(nearestIndex(rows, '2026-12-01'), 2);
  assert.equal(nearestIndex([], '2026-11-08'), -1);
});

test('nearestIndex：日本時間 0:30（UTC では前日 15:30）は日本の日付で判定する', () => {
  const rows = fixtureRows([fx('1', '2026-11-07', 'matsumoto', 'gifu'), fx('2', '2026-11-08', 'gifu', 'matsumoto')], env);
  const nowMs = Date.UTC(2026, 10, 7, 15, 30);   // 日本時間 11/8 0:30
  assert.equal(nearestIndex(rows, jstNow(nowMs).date), 1);
});

test('shouldJumpToToday：0 より大きい位置が記録されていなければ今日に近い行へ動く', () => {
  assert.equal(shouldJumpToToday(undefined), true);   // 未記録
  assert.equal(shouldJumpToToday(0), true);            // redraw の rerender が 0 を記録したあと
  assert.equal(shouldJumpToToday(320), false);         // 利用者が動かした位置を奪わない
});
