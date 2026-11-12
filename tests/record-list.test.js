import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordRows, outcomeCounts, controlsHref, parseRecordsQuery, recordHref, recordsHref, pickSeason, seasonLabel } from '../src/core/record-list.js';

const fx = (id, date, home, away, hs, as, extra = {}) => ({
  id, match_date: date, kickoff: '14:00', status: 'finished', home_club_id: home, away_club_id: away, home_score: hs, away_score: as, ...extra,
});
const fA = fx('A', '2026-10-04', 'matsumoto', 'gifu', 1, 1);
const fB = fx('B', '2026-10-18', 'kochi', 'matsumoto', 0, 2);
const fFuture = fx('F', '2026-11-20', 'matsumoto', 'nara', null, null, { status: 'scheduled' });
const base = { fixtures: [fA, fB, fFuture], records: [{ fixture_id: 'B', watch_style: 'broadcast' }], supportClubId: 'matsumoto', today: '2026-11-11', onlyStadium: false };

test('終わった試合すべてを新しい順に。記録のない試合は「記録なし」、予定の試合は出ない', () => {
  const rows = recordRows(base);
  assert.deepEqual(rows.map((r) => [r.fixture.id, r.style]), [['B', '中継'], ['A', '記録なし']]);
  assert.deepEqual(rows.map((r) => [r.side, r.outcome, r.score]), [['A', 'win', '2-0'], ['H', 'draw', '1-1']]);
  assert.equal(rows[0].record.watch_style, 'broadcast');
  assert.equal(rows[1].record, null);
});

test('現地観戦した試合だけ：観戦方法が現地の行だけ（中継・PV・記録なしは出ない）', () => {
  assert.deepEqual(recordRows({ ...base, onlyStadium: true }).map((r) => r.fixture.id), []);
  const records = [{ fixture_id: 'A', watch_style: 'stadium' }, { fixture_id: 'B', watch_style: 'broadcast' }];
  assert.deepEqual(recordRows({ ...base, records, onlyStadium: true }).map((r) => r.fixture.id), ['A']);
});

test('勝-分-敗：絞り込みなしはシーズンの終わった試合すべて、現地だけなら現地の試合だけ', () => {
  const fC = fx('C', '2026-10-25', 'matsumoto', 'yamaguchi', 0, 2);
  const fNoScore = fx('N', '2026-11-01', 'matsumoto', 'tottori', null, null);
  const fixtures = [fA, fB, fC, fNoScore, fFuture];
  const records = [{ fixture_id: 'C', watch_style: 'stadium' }, { fixture_id: 'B', watch_style: 'broadcast' }];
  assert.deepEqual(outcomeCounts(recordRows({ ...base, fixtures, records })), { win: 1, draw: 1, lose: 1 });
  assert.deepEqual(outcomeCounts(recordRows({ ...base, fixtures, records, onlyStadium: true })), { win: 0, draw: 0, lose: 1 });
  assert.deepEqual(outcomeCounts([]), { win: 0, draw: 0, lose: 0 });
});

test('観戦方法の文言：現地・PV・中継', () => {
  const records = [
    { fixture_id: 'A', watch_style: 'stadium' },
    { fixture_id: 'B', watch_style: 'public_viewing' },
  ];
  assert.deepEqual(recordRows({ ...base, records }).map((r) => r.style), ['PV', '現地']);
});

test('今日に終わった試合（M-1）・終了でない試合（中止・延期）・日付が同じ試合の並び（キックオフ→ID）', () => {
  const same1 = fx('S1', '2026-10-25', 'matsumoto', 'a', 1, 0, { kickoff: '13:00' });
  const same2 = fx('S2', '2026-10-25', 'matsumoto', 'b', 1, 0, { kickoff: '16:00' });
  const today = fx('T', '2026-11-11', 'matsumoto', 'c', 1, 0);
  const off = fx('X', '2026-10-01', 'matsumoto', 'd', null, null, { status: 'cancelled' });
  const rows = recordRows({ ...base, fixtures: [same1, same2, today, off], records: [] });
  assert.deepEqual(rows.map((r) => r.fixture.id), ['T', 'S2', 'S1']);
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

test('試合当日に終わった試合（結果登録済み）も一覧に出る。まだ終わっていない当日の試合は出ない（M-1）', () => {
  const todayDone = fx('T', '2026-11-11', 'matsumoto', 'nara', 2, 0);
  const todayScheduled = fx('S', '2026-11-11', 'matsumoto', 'nara', null, null, { status: 'scheduled' });
  const rows = recordRows({ ...base, fixtures: [fA, todayDone, todayScheduled] });
  assert.deepEqual(rows.map((r) => r.fixture.id), ['T', 'A']);
});

test('観戦記録の詳細の URL：現地だけに絞っているときは ?only=1 を付けて、詳細を開いても絞り込みを残す', () => {
  assert.equal(recordHref('2026-27_J3_16_matsumoto_kanazawa'), '#/records/2026-27_J3_16_matsumoto_kanazawa');
  assert.equal(recordHref('2026-27_J3_16_matsumoto_kanazawa', { only: true }), '#/records/2026-27_J3_16_matsumoto_kanazawa?only=1');
  assert.equal(recordHref('a b'), '#/records/a%20b');
});

test('切り替えの行き先：選んだ試合が絞り込み後の一覧に残れば詳細のまま、消えるなら一覧に戻す', () => {
  const records = [{ fixture_id: 'A', watch_style: 'stadium' }, { fixture_id: 'B', watch_style: 'broadcast' }];
  const rows = recordRows({ ...base, records });
  const env = { seasonId: '2026-27', currentSeasonId: '2026-27', rows };
  // 現地の試合を選んで現地だけに絞る → 詳細のまま
  assert.equal(controlsHref({ ...env, selectedId: 'A', season: '2026-27', only: true }), '#/records/A?only=1');
  // 中継の試合を選んで現地だけに絞る → 一覧に戻る
  assert.equal(controlsHref({ ...env, selectedId: 'B', season: '2026-27', only: true }), '#/records?only=1');
  // 絞り込みを外す → 詳細のまま
  assert.equal(controlsHref({ ...env, selectedId: 'B', season: '2026-27', only: false }), '#/records/B');
  // シーズンを替える → 一覧に戻る
  assert.equal(controlsHref({ ...env, selectedId: 'A', season: '2025', only: false }), '#/records?s=2025');
  // 選んでいない（一覧の画面）→ 一覧。今のシーズンは s を書かない
  assert.equal(controlsHref({ ...env, selectedId: null, season: '2026-27', only: true }), '#/records?only=1');
  // 行がまだ読めていない → 詳細のまま
  assert.equal(controlsHref({ ...env, rows: null, selectedId: 'B', season: '2026-27', only: true }), '#/records/B?only=1');
});
