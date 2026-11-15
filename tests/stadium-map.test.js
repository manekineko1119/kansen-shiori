import { test } from 'node:test';
import assert from 'node:assert/strict';
import { venueOf, summarizeStadiumMap, parseMapQuery, mapHref, mapEntryHref } from '../src/core/stadium-map.js';

const stadiums = [
  { id: 'A', name: 'アルウィン', prefecture: '長野県' },
  { id: 'B', name: 'B会場', prefecture: '岐阜県' },
  { id: 'C', name: 'C会場', prefecture: '東京都' },
  { id: 'D', name: 'D会場', prefecture: '東京都' },
];
const clubs = [
  { id: 'm', name: '松本', home_stadium_id: 'A' },
  { id: 'g', name: '岐阜', home_stadium_id: 'B' },
  { id: 't1', name: '東京1', home_stadium_id: 'C' },
  { id: 't2', name: '東京2', home_stadium_id: 'C' },
];
const clubsById = new Map(clubs.map((c) => [c.id, c]));
const fx = (id, season, date, home, extra = {}) => ({
  id, season_id: season, match_date: date, home_club_id: home, away_club_id: 'g', venue_stadium_id: null, venue_name_override: null, ...extra,
});
const fixtures = [
  fx('f1', 'S1', '2026-08-01', 'm'),
  fx('f2', 'S1', '2026-09-01', 'm'),
  fx('f3', 'S0', '2025-05-01', 'g'),
  fx('f4', 'S1', '2026-10-01', 'm', { venue_name_override: 'レクザム' }),
];
const rec = (id, fixtureId, style = 'stadium') => ({ id, fixture_id: fixtureId, watch_style: style });
const base = { scope: 'all', records: [], fixtures, clubs, stadiums, visits: [], seasonClubs: null, supportClubId: null };
const sum = (o) => summarizeStadiumMap({ ...base, ...o });

test('venueOf：会場の id、未定・空はホーム会場、それ以外の名前は null', () => {
  assert.equal(venueOf({ venue_stadium_id: 'D', home_club_id: 'm' }, clubsById), 'D');
  assert.equal(venueOf({ home_club_id: 'm' }, clubsById), 'A');
  assert.equal(venueOf({ home_club_id: 'm', venue_name_override: '' }, clubsById), 'A');
  assert.equal(venueOf({ home_club_id: 'm', venue_name_override: '未定' }, clubsById), 'A');
  assert.equal(venueOf({ home_club_id: 'm', venue_name_override: ' 未定 ' }, clubsById), 'A');
  assert.equal(venueOf({ home_club_id: 'm', venue_name_override: 'レクザム' }, clubsById), null);
});

test('現地の記録だけを数える', () => {
  const r = sum({ records: [rec('r1', 'f1', 'broadcast'), rec('r2', 'f2', 'public_viewing')] });
  assert.deepEqual(r.visited, []);
  assert.equal(r.totals.visited, 0);
});

test('通算：現地の記録と手の記録を数える', () => {
  const r = sum({ records: [rec('r1', 'f1'), rec('r2', 'f2')], visits: [{ id: 'v1', stadium_id: 'B', season_id: null }] });
  assert.deepEqual(r.visited.map((v) => [v.stadium.id, v.count]), [['A', 2], ['B', 1]]);
  assert.deepEqual(r.visited[0].fixtureIds, ['f1', 'f2']);
  assert.deepEqual(r.visited[1].visits, [{ id: 'v1', season_id: null }]);
  assert.equal(r.totals.visited, 2);
  assert.deepEqual([...r.prefectures].sort(), ['岐阜県', '長野県']);
  assert.deepEqual([...r.baseIds].sort(), ['A', 'B', 'C', 'D']);
  assert.equal(r.totals.all, 4);
  assert.equal(r.totals.prefVisited, 2);
  assert.equal(r.totals.prefAll, 47);
});

test('シーズン S1：シーズンなしの手の記録と S0 の試合は数えない', () => {
  const r = sum({
    scope: 'S1',
    records: [rec('r1', 'f1'), rec('r3', 'f3')],
    visits: [{ id: 'v1', stadium_id: 'B', season_id: null }, { id: 'v2', stadium_id: 'D', season_id: 'S1' }],
  });
  assert.deepEqual(r.visited.map((v) => v.stadium.id), ['A', 'D']);
});

test('シーズンの分母：応援クラブの大会のホーム会場', () => {
  const seasonClubs = [
    { season_id: 'S1', competition: 'J3', club_id: 'm' },
    { season_id: 'S1', competition: 'J3', club_id: 'g' },
    { season_id: 'S1', competition: 'J1', club_id: 't1' },
  ];
  const r = sum({ scope: 'S1', seasonClubs, supportClubId: 'm' });
  assert.deepEqual([...r.baseIds].sort(), ['A', 'B']);
  assert.equal(r.totals.all, 2);
  assert.equal(r.totals.prefAll, 2);
});

test('同じホーム会場は1つ', () => {
  const seasonClubs = [
    { season_id: 'S1', competition: 'J1', club_id: 't1' },
    { season_id: 'S1', competition: 'J1', club_id: 't2' },
  ];
  const r = sum({ scope: 'S1', seasonClubs, supportClubId: 't1' });
  assert.deepEqual(r.baseIds, ['C']);
  assert.equal(r.totals.all, 1);
  assert.equal(r.totals.prefAll, 1);
});

test('分母なし：応援クラブなし・所属なし・seasonClubs が null', () => {
  const seasonClubs = [{ season_id: 'S1', competition: 'J3', club_id: 'g' }];
  for (const o of [{ supportClubId: null, seasonClubs }, { supportClubId: 'm', seasonClubs }, { supportClubId: 'm', seasonClubs: null }]) {
    const r = sum({ scope: 'S1', ...o });
    assert.equal(r.baseIds, null);
    assert.equal(r.totals.all, null);
    assert.equal(r.totals.prefAll, null);
  }
});

test('応援クラブを変えると分母の大会が変わる', () => {
  const seasonClubs = [
    { season_id: 'S1', competition: 'J3', club_id: 'm' },
    { season_id: 'S1', competition: 'J2', club_id: 'g' },
    { season_id: 'S1', competition: 'J2', club_id: 't1' },
  ];
  assert.deepEqual([...sum({ scope: 'S1', seasonClubs, supportClubId: 'g' }).baseIds].sort(), ['B', 'C']);
  assert.deepEqual(sum({ scope: 'S1', seasonClubs, supportClubId: 'm' }).baseIds, ['A']);
});

test('会場が登録されていない現地の観戦は「地図に出せない観戦」', () => {
  const r = sum({ records: [rec('r4', 'f4'), rec('r1', 'f1')] });
  assert.deepEqual(r.unplaced, [{ fixtureId: 'f4', venueName: 'レクザム' }]);
  assert.deepEqual(r.visited.map((v) => v.stadium.id), ['A']);
});

test('地図に出せない観戦は日付の新しい順', () => {
  const more = [...fixtures, fx('f5', 'S1', '2026-11-01', 'm', { venue_name_override: 'ヤジン' })];
  const r = sum({ fixtures: more, records: [rec('r4', 'f4'), rec('r5', 'f5')] });
  assert.deepEqual(r.unplaced.map((u) => u.fixtureId), ['f5', 'f4']);
});

test('試合が見つからない現地の記録は unplaced に会場不明で入れる。知らない会場の手の記録は数えない', () => {
  const r = sum({ records: [rec('rx', 'nothing')], visits: [{ id: 'v', stadium_id: 'ZZ', season_id: null }] });
  assert.deepEqual(r.visited, []);
  assert.deepEqual(r.unplaced, [{ fixtureId: 'nothing', venueName: '' }]);
});

test('試合が見つからない記録はシーズンの scope では入れない（通算だけ）。現地以外の記録も入れない', () => {
  const records = [rec('rx', 'nothing'), rec('ry', 'nothing2', 'tv')];
  assert.deepEqual(sum({ scope: 'S1', records }).unplaced, []);
  assert.deepEqual(sum({ scope: 'all', records }).unplaced, [{ fixtureId: 'nothing', venueName: '' }]);
});

test('シーズンの scope では unplaced もそのシーズンの試合だけ', () => {
  const more = [...fixtures, fx('f6', 'S0', '2025-06-01', 'g', { venue_name_override: 'ヤジン' })];
  const records = [rec('r4', 'f4'), rec('r6', 'f6')];
  assert.deepEqual(sum({ fixtures: more, scope: 'S1', records }).unplaced.map((u) => u.fixtureId), ['f4']);
  assert.deepEqual(sum({ fixtures: more, scope: 'S0', records }).unplaced.map((u) => u.fixtureId), ['f6']);
});

test('消された会場（venue_stadium_id が stadiums にない）を指す記録は venueName 空で unplaced', () => {
  const more = [...fixtures, fx('f7', 'S1', '2026-12-01', 'm', { venue_stadium_id: 'GONE' })];
  const r = sum({ fixtures: more, records: [rec('r7', 'f7')] });
  assert.deepEqual(r.unplaced, [{ fixtureId: 'f7', venueName: '' }]);
  assert.deepEqual(r.visited, []);
});

test('並び順：回数が同じなら stadium.id の順', () => {
  const r = sum({ visits: [{ id: 'v1', stadium_id: 'D', season_id: null }, { id: 'v2', stadium_id: 'B', season_id: null }, { id: 'v3', stadium_id: 'C', season_id: null }, { id: 'v4', stadium_id: 'C', season_id: null }] });
  assert.deepEqual(r.visited.map((v) => v.stadium.id), ['C', 'B', 'D']);
});

test('mapHref / parseMapQuery：シーズンを URL に出し入れする', () => {
  assert.equal(mapHref(), '#/map');
  assert.equal(mapHref({ season: '2026-special' }), '#/map?s=2026-special');
  assert.deepEqual(parseMapQuery('s=2025'), { season: '2025' });
  assert.deepEqual(parseMapQuery(''), { season: null });
});

test('mapEntryHref：記録の画面から地図へ。シーズンを引き継ぐ', () => {
  assert.equal(mapEntryHref({ name: 'records', query: 's=2025' }), '#/map?s=2025');
  assert.equal(mapEntryHref({ name: 'records', query: '' }), '#/map');
  assert.equal(mapEntryHref({ name: 'record', params: { fixtureId: '2026-27_J3_15_sanuki_matsumoto' } }), '#/map?s=2026-27');
  assert.equal(mapEntryHref({ name: 'record', params: { fixtureId: 'xxx' } }), '#/map');
  assert.equal(mapEntryHref({ name: 'search' }), null);
});
