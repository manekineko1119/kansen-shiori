import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthGrid, calendarItems, shouldShowRecordBanner } from '../src/core/calendar.js';

test('shouldShowRecordBanner: スタジアム観戦だけ', () => {
  assert.equal(shouldShowRecordBanner({ watch_style: 'stadium' }), true);
  assert.equal(shouldShowRecordBanner({ watch_style: 'broadcast' }), false);
  assert.equal(shouldShowRecordBanner(null), false);
});

test('monthGrid: 日曜はじまりで前後の月も埋める', () => {
  const g = monthGrid(2026, 11);
  assert.equal(g[0][0], '2026-11-01');
  assert.equal(g[0].length, 7);
  assert.equal(g.at(-1).at(-1), '2026-12-05');
  assert.equal(monthGrid(2027, 2).flat().length % 7, 0);
  const feb = monthGrid(2028, 2);
  assert.equal(feb[0][0], '2028-01-30');
  assert.ok(feb.flat().includes('2028-02-29'));
});

const cfx = [
  { id: 'f1', match_date: '2026-11-21', home_club_id: 'gifu', away_club_id: 'matsumoto', status: 'finished', home_score: 1, away_score: 2 },
  { id: 'f2', match_date: '2026-11-29', home_club_id: 'matsumoto', away_club_id: 'nara', status: 'scheduled' },
];
const base = {
  fixtures: cfx,
  fixturesById: Object.fromEntries(cfx.map((f) => [f.id, f])),
  supportClubId: 'matsumoto',
  today: '2026-11-25',
  trips: [
    { id: 't1', fixture_id: 'f1', lodging: 'none' },
    { id: 't2', fixture_id: null, custom_date: '2026-11-28', custom_venue: '国立', lodging: 'none' },
  ],
  records: [{ fixture_id: 'f1', watch_style: 'stadium' }],
};

test('calendarItems: 結果・記録・遠征予定・これからの試合', () => {
  const items = calendarItems(base);
  assert.deepEqual(items.get('2026-11-21'), [
    { type: 'result', fixtureId: 'f1', homeAway: 'A', outcome: 'win' },
    { type: 'record', fixtureId: 'f1' },
  ]); // 終わった遠征予定 t1 は出さない（FR-57d）
  assert.deepEqual(items.get('2026-11-28'), [{ type: 'trip', tripId: 't2' }]);
  assert.deepEqual(items.get('2026-11-29'), [{ type: 'fixture', fixtureId: 'f2', homeAway: 'H' }]);
});

test('calendarItems: スタジアム以外の記録は出さない・結果未登録は outcome null', () => {
  const fx = [{ id: 'f1', match_date: '2026-11-21', home_club_id: 'gifu', away_club_id: 'matsumoto', status: 'finished', home_score: null, away_score: null }];
  const items = calendarItems({ ...base, fixtures: fx, fixturesById: { f1: fx[0] }, trips: [],
    records: [{ fixture_id: 'f1', watch_style: 'broadcast' }] });
  assert.deepEqual(items.get('2026-11-21'), [{ type: 'result', fixtureId: 'f1', homeAway: 'A', outcome: null }]);
});

test('calendarItems: これからの遠征予定は宿泊の日にも出し、同じ日は試合・記録・遠征の順', () => {
  const trips = [{ id: 't3', fixture_id: 'f2', lodging: 'both' }];
  const items = calendarItems({ ...base, trips });
  assert.deepEqual(items.get('2026-11-28'), [{ type: 'trip', tripId: 't3' }]);
  assert.deepEqual(items.get('2026-11-29').map((i) => i.type), ['fixture', 'trip']);
  assert.deepEqual(items.get('2026-11-30'), [{ type: 'trip', tripId: 't3' }]);
});

test('calendarItems: 応援クラブが出ない試合は出さない', () => {
  const other = { id: 'f9', match_date: '2026-11-29', home_club_id: 'gifu', away_club_id: 'nara', status: 'scheduled' };
  const items = calendarItems({ ...base, fixtures: [...cfx, other], trips: [], records: [] });
  assert.deepEqual(items.get('2026-11-29'), [{ type: 'fixture', fixtureId: 'f2', homeAway: 'H' }]);
});

test('calendarItems: スナップショットにない試合の遠征予定で落ちない', () => {
  const items = calendarItems({ ...base, trips: [{ id: 'tx', fixture_id: 'gone', lodging: 'both' }] });
  assert.equal(items.has('2026-11-28'), false);
});
