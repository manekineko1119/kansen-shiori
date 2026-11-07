import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sqlLiteral, sqlJsonb, sqlTextArray, buildSeedSql } from '../scripts/seed-sql.js';

// 初期データ（seed-data の JSON）から seed.sql を作る（設計書 2章・11.4、D8）

test('sqlLiteral：文字列は引用符で囲み、中の引用符は2つにする', () => {
  assert.equal(sqlLiteral("O'Neil"), "'O''Neil'");
  assert.equal(sqlLiteral('松本'), "'松本'");
  assert.equal(sqlLiteral(''), "''");
});

test('sqlLiteral：null・undefined は null、数と真偽値はそのまま', () => {
  assert.equal(sqlLiteral(null), 'null');
  assert.equal(sqlLiteral(undefined), 'null');
  assert.equal(sqlLiteral(35.5), '35.5');
  assert.equal(sqlLiteral(0), '0');
  assert.equal(sqlLiteral(true), 'true');
  assert.equal(sqlLiteral(false), 'false');
});

test('sqlLiteral：数でない数（NaN・Infinity）と、文字列・数・真偽値以外は受け付けない', () => {
  assert.throws(() => sqlLiteral(NaN));
  assert.throws(() => sqlLiteral(Infinity));
  assert.throws(() => sqlLiteral({ a: 1 }));
  assert.throws(() => sqlLiteral(['a']));
});

test('sqlJsonb：JSON にして ::jsonb を付ける。中の引用符も2つにする', () => {
  assert.equal(sqlJsonb({ a: 1 }), `'{"a":1}'::jsonb`);
  assert.equal(sqlJsonb([]), `'[]'::jsonb`);
  assert.equal(sqlJsonb({ note: "O'Neil" }), `'{"note":"O''Neil"}'::jsonb`);
  assert.equal(sqlJsonb(null), 'null');
  assert.equal(sqlJsonb(undefined), 'null');
});

test('sqlJsonb：中に NaN・Infinity があれば null に変えずにエラーにする（Codex の指摘）', () => {
  assert.throws(() => sqlJsonb({ lat: NaN }), /NaN|数/);
  assert.throws(() => sqlJsonb([{ name: '松本', walk_min: Infinity }]), /Infinity|数/);
  assert.throws(() => sqlJsonb({ a: { b: [1, -Infinity] } }), /Infinity|数/);
  assert.equal(sqlJsonb({ a: [1, 2.5, null, 'x', true] }), `'{"a":[1,2.5,null,"x",true]}'::jsonb`);
});

test('sqlTextArray：空なら {}、それ以外は array[...]', () => {
  assert.equal(sqlTextArray([]), `'{}'::text[]`);
  assert.equal(sqlTextArray(undefined), `'{}'::text[]`);
  assert.equal(sqlTextArray(['a', "b'c"]), `array['a','b''c']::text[]`);
});

const data = {
  stadiums: [{ id: 't-st', name: "テスト'競技場", prefecture: '長野県', address: '長野県テスト市1', lat: 36.2, lng: 137.9, stations: [{ name: '松本', kind: 'nearest', toyoko: [] }], airports: [] }],
  clubs: [{ id: 't-club', name: 'テストFC', short_name: 'テスト', aliases: ['TEST FC'], home_stadium_id: 't-st', video_sources: [] }],
  seasons: [{ id: '2026-27', starts_on: '2026-08-08', ends_on: '2027-05-23', is_current: true }],
  season_clubs: [{ season_id: '2026-27', competition: 'J3', club_id: 't-club' }],
};

test('buildSeedSql：先頭に「手で直さない」の注意、表の順はスタジアム→クラブ→シーズン→所属', () => {
  const sql = buildSeedSql(data);
  assert.match(sql.split('\n')[0], /npm run seed/);
  const order = ['stadiums', 'clubs', 'seasons', 'season_clubs'].map((t) => sql.indexOf(`insert into public.${t} `));
  assert.ok(order.every((i) => i >= 0), '4つの表すべての insert がある');
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test('buildSeedSql：1行に1件の insert。どれも on conflict do nothing で終わる（流し直しても上書きしない）', () => {
  const lines = buildSeedSql(data).split('\n').filter((l) => l.startsWith('insert '));
  assert.equal(lines.length, 4);
  for (const l of lines) assert.match(l, / on conflict do nothing;$/);
});

test('buildSeedSql：列の型ごとに書き方を変え、JSON にない列は null にする', () => {
  const sql = buildSeedSql(data);
  const st = sql.split('\n').find((l) => l.startsWith('insert into public.stadiums '));
  assert.match(st, /'テスト''競技場'/);
  assert.match(st, /'\[\{"name":"松本","kind":"nearest","toyoko":\[\]\}\]'::jsonb/);
  assert.match(st, /36\.2, 137\.9/);
  const club = sql.split('\n').find((l) => l.startsWith('insert into public.clubs '));
  assert.match(club, /array\['TEST FC'\]::text\[\]/);
  assert.match(club, /\(id, name, short_name, aliases, official_url, jleague_url, home_stadium_id, theme_colors, video_sources\)/);
  assert.match(club, /'t-club', 'テストFC', 'テスト', array\['TEST FC'\]::text\[\], null, null, 't-st', null, '\[\]'::jsonb\)/);
  const season = sql.split('\n').find((l) => l.startsWith('insert into public.seasons '));
  assert.match(season, /'2026-27', '2026-08-08', '2027-05-23', true\)/);
});

test('buildSeedSql：改行は \\n だけで、最後も改行で終わる', () => {
  const sql = buildSeedSql(data);
  assert.ok(!sql.includes('\r'));
  assert.ok(sql.endsWith('\n'));
});

test('buildSeedSql：JSON に知らない項目があればエラー（列名の書き間違いを見逃さない）', () => {
  assert.throws(() => buildSeedSql({ ...data, clubs: [{ ...data.clubs[0], shortname: 'x' }] }), /shortname/);
});
