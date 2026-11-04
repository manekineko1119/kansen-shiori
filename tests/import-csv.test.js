import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFixturesCsv } from '../src/core/import-csv.js';

const season = { id: '2026-27', starts_on: '2026-08-08', ends_on: '2027-05-23' };
const clubs = [
  { id: 'matsumoto', name: '松本山雅FC', short_name: '松本', aliases: ['松本山雅'] },
  { id: 'gifu', name: 'FC岐阜', short_name: '岐阜', aliases: [] },
];
const stadiums = [{ id: 'alwin', name: 'サンプロ アルウィン' }];
const ctx = { season, clubs, stadiums: [] };

test('混在した入力を解析する（年の補い・全角・タブ・未定・エラー行）', () => {
  const r = parseFixturesCsv(
    '日付,キックオフ,大会,節,ホーム,アウェイ\n11/21,14:00,J3,15,ＦＣ岐阜,松本\n2027/3/13\t未定\tJ3\t26\t松本山雅FC\t岐阜\n\n3/13,13:00,J3,26,松本,鹿児島\n9/1,13:00,J3,3,松本,岐阜\n6/1,13:00,J3,40,松本,岐阜',
    ctx,
  );
  assert.deepEqual(r.ok.map((x) => [x.id, x.match_date, x.kickoff]), [
    ['2026-27_J3_15_gifu_matsumoto', '2026-11-21', '14:00'],
    ['2026-27_J3_26_matsumoto_gifu', '2027-03-13', null],
    ['2026-27_J3_3_matsumoto_gifu', '2026-09-01', '13:00'],
  ]);
  assert.deepEqual(r.errors.map((e) => e.line), [5, 7]);
  assert.match(r.errors[0].reason, /鹿児島/);
});

test('スマホ版のJリーグ公式URLは /sp/ を取り除いて保存する', () => {
  const u = parseFixturesCsv('2026/11/21,14:00,J3,15,岐阜,松本,,https://www.jleague.jp/sp/match/j3/2026/112101/', ctx);
  assert.equal(u.ok[0].jleague_match_url, 'https://www.jleague.jp/match/j3/2026/112101/');
});

test('Jリーグ公式でないURLはその行のエラー', () => {
  const u = parseFixturesCsv('2026/11/21,14:00,J3,15,岐阜,松本,,https://example.com/match/1/', ctx);
  assert.equal(u.ok.length, 0);
  assert.deepEqual(u.errors.map((e) => e.line), [1]);
});

test('FixtureRow の全列が入る。URLなし・会場なしは null', () => {
  const r = parseFixturesCsv('2026-11-21,14:00,J3,15,岐阜,松本', ctx);
  assert.deepEqual(r.ok[0], {
    id: '2026-27_J3_15_gifu_matsumoto',
    season_id: '2026-27',
    competition: 'J3',
    round: '15',
    match_date: '2026-11-21',
    kickoff: '14:00',
    home_club_id: 'gifu',
    away_club_id: 'matsumoto',
    venue_stadium_id: null,
    venue_name_override: null,
    jleague_match_url: null,
  });
});

test('会場：スタジアム名に一致すれば venue_stadium_id、しなければ venue_name_override', () => {
  const a = parseFixturesCsv('11/21,14:00,J3,15,松本,岐阜,サンプロ　アルウィン', { season, clubs, stadiums });
  assert.equal(a.ok[0].venue_stadium_id, 'alwin');
  assert.equal(a.ok[0].venue_name_override, null);
  const b = parseFixturesCsv('11/21,14:00,J3,15,松本,岐阜,どこかの競技場', { season, clubs, stadiums });
  assert.equal(b.ok[0].venue_stadium_id, null);
  assert.equal(b.ok[0].venue_name_override, 'どこかの競技場');
});

test('キックオフ：未定・-・空は null、9:00 は 09:00、不正は行エラー', () => {
  const k = (v) => parseFixturesCsv(`11/21,${v},J3,15,松本,岐阜`, ctx);
  assert.equal(k('未定').ok[0].kickoff, null);
  assert.equal(k('-').ok[0].kickoff, null);
  assert.equal(k('').ok[0].kickoff, null);
  assert.equal(k('9:00').ok[0].kickoff, '09:00');
  assert.equal(k('１４：００').ok[0].kickoff, '14:00');
  assert.deepEqual(k('25:00').errors.map((e) => e.line), [1]);
  assert.deepEqual(k('夜').errors.map((e) => e.line), [1]);
});

test('節が空なら ID に日付 YYYYMMDD が入る', () => {
  const r = parseFixturesCsv('2026-12-02,19:00,天皇杯,,松本,岐阜', ctx);
  assert.equal(r.ok[0].id, '2026-27_天皇杯_20261202_matsumoto_gifu');
  assert.equal(r.ok[0].round, '');
});

test('buildFixtureId が例外を投げる行（大会に _）はその行のエラーになる', () => {
  const r = parseFixturesCsv('11/21,14:00,J_3,15,松本,岐阜\n11/22,14:00,J3,16,松本,岐阜', ctx);
  assert.deepEqual(r.errors.map((e) => e.line), [1]);
  assert.equal(r.ok.length, 1);
});

test('日付の不正・範囲外・存在しない日・ホームとアウェイが同じ・列不足はエラー', () => {
  const lines = [
    'あした,14:00,J3,1,松本,岐阜',
    '2/30,14:00,J3,1,松本,岐阜',
    '2025/11/21,14:00,J3,1,松本,岐阜',
    '11/21,14:00,J3,1,松本,松本',
    '11/21,14:00,J3',
  ].join('\n');
  const r = parseFixturesCsv(lines, ctx);
  assert.equal(r.ok.length, 0);
  assert.deepEqual(r.errors.map((e) => e.line), [1, 2, 3, 4, 5]);
});

test('年の補い：シーズンの後半の月は翌年、前半の月は開始年。うるう年の2/29', () => {
  const s = { id: '2027-28', starts_on: '2027-08-01', ends_on: '2028-05-31' };
  const r = parseFixturesCsv('2/29,14:00,J3,1,松本,岐阜\n12/31,14:00,J3,2,松本,岐阜', { season: s, clubs, stadiums: [] });
  assert.deepEqual(r.ok.map((x) => x.match_date), ['2028-02-29', '2027-12-31']);
});

test('見出し行は飛ばすが行番号は数える。CRLF・空の入力も扱える', () => {
  const r = parseFixturesCsv('日付,キックオフ\r\n11/21,14:00,J3,15,松本,鹿児島\r\n', ctx);
  assert.deepEqual(r.errors.map((e) => e.line), [2]);
  assert.deepEqual(parseFixturesCsv('', ctx), { ok: [], errors: [] });
});
