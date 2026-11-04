import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nextAwayFixture, isResultOverdue, unresultedFixtures, recordPromptFixture, NEXT_MATCH_GRACE_MIN,
} from '../src/core/fixtures.js';

const now = (d, t) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), +t.slice(0, 2) - 9, +t.slice(3, 5)); // 日本時間→ms
const fx = [
  { id: 'a', away_club_id: 'matsumoto', home_club_id: 'gifu', match_date: '2026-11-21', kickoff: '14:00', status: 'scheduled' },
  { id: 'b', away_club_id: 'matsumoto', home_club_id: 'nara', match_date: '2026-11-29', kickoff: null, status: 'scheduled' },
  { id: 'c', away_club_id: 'matsumoto', home_club_id: 'kanazawa', match_date: '2026-11-15', kickoff: '13:00', status: 'postponed' },
  { id: 'h', home_club_id: 'matsumoto', away_club_id: 'osaka', match_date: '2026-11-18', kickoff: '19:00', status: 'scheduled' },
];

test('猶予時間は180分', () => {
  assert.equal(NEXT_MATCH_GRACE_MIN, 180);
});

test('nextAwayFixture：延期とホームを除き、キックオフ後3時間まで次の試合', () => {
  assert.equal(nextAwayFixture(fx, 'matsumoto', now('2026-11-14', '10:00')).id, 'a');
  assert.equal(nextAwayFixture(fx, 'matsumoto', now('2026-11-21', '16:59')).id, 'a');
  assert.equal(nextAwayFixture(fx, 'matsumoto', now('2026-11-21', '17:00')).id, 'b');
});

test('nextAwayFixture：キックオフ未定は当日いっぱい、その後は null', () => {
  assert.equal(nextAwayFixture(fx, 'matsumoto', now('2026-11-29', '23:59')).id, 'b');
  assert.equal(nextAwayFixture(fx, 'matsumoto', now('2026-11-30', '00:00')), null);
});

test('nextAwayFixture：日本時間0時台でも日本の日付で判定する', () => {
  assert.equal(nextAwayFixture(fx, 'matsumoto', now('2026-11-21', '00:30')).id, 'a');
});

test('isResultOverdue：キックオフ+2時間、未定なら翌日0時', () => {
  assert.equal(isResultOverdue(fx[0], now('2026-11-21', '15:59')), false);
  assert.equal(isResultOverdue(fx[0], now('2026-11-21', '16:00')), true);
  assert.equal(isResultOverdue(fx[1], now('2026-11-29', '23:59')), false);
  assert.equal(isResultOverdue(fx[1], now('2026-11-30', '00:00')), true);
});

test('unresultedFixtures：scheduled かつ未入力、日付の古い順', () => {
  assert.deepEqual(unresultedFixtures(fx, now('2026-11-30', '12:00')).map(f => f.id), ['h', 'a', 'b']);
});

test('recordPromptFixture：試合終了の目安〜翌日いっぱい', () => {
  assert.equal(recordPromptFixture(fx, 'matsumoto', now('2026-11-21', '16:00')).id, 'a');
  assert.equal(recordPromptFixture(fx, 'matsumoto', now('2026-11-22', '23:59')).id, 'a');
  assert.equal(recordPromptFixture(fx, 'matsumoto', now('2026-11-23', '00:00')), null);
  assert.equal(recordPromptFixture(fx, 'matsumoto', now('2026-11-21', '15:59')), null);
});

test('recordPromptFixture：ホームも対象、未定は翌日0時から、複数なら新しい試合、延期は除く', () => {
  assert.equal(recordPromptFixture(fx, 'matsumoto', now('2026-11-18', '21:00')).id, 'h');
  assert.equal(recordPromptFixture(fx, 'matsumoto', now('2026-11-29', '23:59')), null);
  assert.equal(recordPromptFixture(fx, 'matsumoto', now('2026-11-30', '00:00')).id, 'b');
  assert.equal(recordPromptFixture(fx, 'matsumoto', now('2026-11-16', '12:00')), null); // c は延期
  const two = [
    { id: 'x', home_club_id: 'matsumoto', away_club_id: 'p', match_date: '2026-11-20', kickoff: '19:00', status: 'scheduled' },
    { id: 'y', home_club_id: 'q', away_club_id: 'matsumoto', match_date: '2026-11-21', kickoff: '14:00', status: 'scheduled' },
  ];
  assert.equal(recordPromptFixture(two, 'matsumoto', now('2026-11-21', '17:00')).id, 'y');
});
