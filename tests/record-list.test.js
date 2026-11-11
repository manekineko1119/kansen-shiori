import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordRows, parseRecordsQuery, recordsHref, pickSeason, seasonLabel } from '../src/core/record-list.js';

const fx = (id, date, home, away, hs, as, extra = {}) => ({
  id, match_date: date, kickoff: '14:00', status: 'finished', home_club_id: home, away_club_id: away, home_score: hs, away_score: as, ...extra,
});
const fA = fx('A', '2026-10-04', 'matsumoto', 'gifu', 1, 1);
const fB = fx('B', '2026-10-18', 'kochi', 'matsumoto', 0, 2);
const fFuture = fx('F', '2026-11-20', 'matsumoto', 'nara', null, null, { status: 'scheduled' });
const base = { fixtures: [fA, fB, fFuture], records: [{ fixture_id: 'B', watch_style: 'broadcast' }], supportClubId: 'matsumoto', today: '2026-11-11', onlyWatched: false };

test('終わった試合すべてを新しい順に。記録のない試合は「記録なし」、予定の試合は出ない', () => {
  const rows = recordRows(base);
  assert.deepEqual(rows.map((r) => [r.fixture.id, r.style]), [['B', '中継'], ['A', '記録なし']]);
  assert.deepEqual(rows.map((r) => [r.side, r.outcome, r.score]), [['A', 'win', '2-0'], ['H', 'draw', '1-1']]);
  assert.equal(rows[0].record.watch_style, 'broadcast');
  assert.equal(rows[1].record, null);
});

test('観戦した試合だけ：記録のある行だけ', () => {
  assert.deepEqual(recordRows({ ...base, onlyWatched: true }).map((r) => r.fixture.id), ['B']);
});

test('観戦方法の文言：現地・PV・中継', () => {
  const records = [
    { fixture_id: 'A', watch_style: 'stadium' },
    { fixture_id: 'B', watch_style: 'public_viewing' },
  ];
  assert.deepEqual(recordRows({ ...base, records }).map((r) => r.style), ['PV', '現地']);
});

test('今日の試合・終了でない試合（中止・延期）・日付が同じ試合の並び（キックオフ→ID）', () => {
  const same1 = fx('S1', '2026-10-25', 'matsumoto', 'a', 1, 0, { kickoff: '13:00' });
  const same2 = fx('S2', '2026-10-25', 'matsumoto', 'b', 1, 0, { kickoff: '16:00' });
  const today = fx('T', '2026-11-11', 'matsumoto', 'c', 1, 0);
  const off = fx('X', '2026-10-01', 'matsumoto', 'd', null, null, { status: 'cancelled' });
  const rows = recordRows({ ...base, fixtures: [same1, same2, today, off], records: [] });
  assert.deepEqual(rows.map((r) => r.fixture.id), ['S2', 'S1']);
});

test('スコア未登録の終わった試合は、結果なし（outcome・score は null）で出る', () => {
  const rows = recordRows({ ...base, fixtures: [fx('N', '2026-10-04', 'matsumoto', 'gifu', null, null)], records: [] });
  assert.deepEqual(rows.map((r) => [r.fixture.id, r.outcome, r.score]), [['N', null, null]]);
});

test('URL の条件：s と only。知らない値・空は既定', () => {
  assert.deepEqual(parseRecordsQuery('s=2025&only=1'), { season: '2025', only: true });
  assert.deepEqual(parseRecordsQuery(''), { season: null, only: false });
  assert.deepEqual(parseRecordsQuery('only=0&s='), { season: null, only: false });
  assert.deepEqual(parseRecordsQuery(undefined), { season: null, only: false });
});

test('一覧の URL：既定の値は書かない', () => {
  assert.equal(recordsHref({}), '#/records');
  assert.equal(recordsHref({ season: '2025', only: true }), '#/records?s=2025&only=1');
  assert.equal(recordsHref({ season: null, only: true }), '#/records?only=1');
  assert.equal(recordsHref({ season: '2026-27', only: false }), '#/records?s=2026-27');
});

test('シーズンの選び：なし・今のシーズン→今のシーズン。知らない値→今のシーズン。読み込み中は指定どおり', () => {
  const seasons = [{ id: '2026-27' }, { id: '2025' }];
  assert.equal(pickSeason({ requested: null, currentId: '2026-27', seasons }), '2026-27');
  assert.equal(pickSeason({ requested: '2025', currentId: '2026-27', seasons }), '2025');
  assert.equal(pickSeason({ requested: 'zzz', currentId: '2026-27', seasons }), '2026-27');
  assert.equal(pickSeason({ requested: '2025', currentId: '2026-27', seasons: undefined }), '2025');
  assert.equal(pickSeason({ requested: '2025', currentId: '2026-27', seasons: null }), '2025');
});

test('シーズンの名前', () => {
  assert.equal(seasonLabel('2026-27'), '2026-27シーズン');
});
