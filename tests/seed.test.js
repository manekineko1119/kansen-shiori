import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateStadium, validateClub } from '../src/core/validate.js';
import { buildSeedSql } from '../scripts/seed-sql.js';

// 初期データ（supabase/seed-data/2026-27.json）の中身と、seed.sql が作り直されているか（設計書 11.4、D8）

const data = JSON.parse(readFileSync(new URL('../supabase/seed-data/2026-27.json', import.meta.url), 'utf8'));
const seedSql = readFileSync(new URL('../supabase/seed.sql', import.meta.url), 'utf8').replaceAll('\r\n', '\n');

test('スタジアムはどれも validateStadium を通る', () => {
  assert.ok(data.stadiums.length > 0);
  for (const s of data.stadiums) {
    const r = validateStadium(s);
    assert.ok(r.ok, `${s.id}: ${JSON.stringify(r.errors)}`);
  }
});

test('クラブはどれも validateClub を通る', () => {
  assert.ok(data.clubs.length > 0);
  for (const c of data.clubs) {
    const r = validateClub(c);
    assert.ok(r.ok, `${c.id}: ${JSON.stringify(r.errors)}`);
  }
});

test('ID は表の中で重ならない', () => {
  for (const table of ['stadiums', 'clubs', 'seasons']) {
    const ids = data[table].map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length, `${table} の ID が重なっている`);
  }
});

test('クラブのホームスタジアムは、すべてスタジアムの表にある', () => {
  const stadiumIds = new Set(data.stadiums.map((s) => s.id));
  for (const c of data.clubs) {
    if (c.home_stadium_id != null) assert.ok(stadiumIds.has(c.home_stadium_id), `${c.id} → ${c.home_stadium_id}`);
  }
});

test('所属のクラブとシーズンは、それぞれの表にある', () => {
  const clubIds = new Set(data.clubs.map((c) => c.id));
  const seasonIds = new Set(data.seasons.map((s) => s.id));
  for (const sc of data.season_clubs) {
    assert.ok(clubIds.has(sc.club_id), `所属のクラブ ${sc.club_id} がない`);
    assert.ok(seasonIds.has(sc.season_id), `所属のシーズン ${sc.season_id} がない`);
  }
});

test('「今のシーズン」は1つだけで、2026-27', () => {
  const current = data.seasons.filter((s) => s.is_current);
  assert.deepEqual(current.map((s) => s.id), ['2026-27']);
  assert.equal(current[0].starts_on, '2026-08-08');
  assert.equal(current[0].ends_on, '2027-05-23');
});

test('応援クラブの初期値の松本山雅FCがあり、J3 の所属に入っている（user_settings の既定値が参照する）', () => {
  const m = data.clubs.find((c) => c.id === 'matsumoto');
  assert.ok(m);
  assert.equal(m.jleague_url, 'https://www.jleague.jp/club/matsumoto/');
  assert.deepEqual(m.video_sources, [{ channel: '@yamagachannel', kinds: { highlight: ['明治安田'], inside: ['【INSIDE】'] } }]);
  assert.ok(data.season_clubs.some((sc) => sc.season_id === '2026-27' && sc.competition === 'J3' && sc.club_id === 'matsumoto'));
});

test('seed.sql は JSON から作り直してある（npm run seed の忘れを見つける）', () => {
  assert.equal(seedSql, buildSeedSql(data));
});

test('seed.sql の insert はどれも on conflict do nothing（本番で流し直しても上書きしない）', () => {
  const inserts = seedSql.split('\n').filter((l) => l.startsWith('insert '));
  assert.ok(inserts.length > 0);
  for (const l of inserts) assert.match(l, / on conflict do nothing;$/);
});

test('2026-27 の J3 は20クラブで、どのクラブにもホームスタジアムがある（設計書 12章 No.6）', () => {
  const j3 = data.season_clubs.filter((sc) => sc.season_id === '2026-27' && sc.competition === 'J3').map((sc) => sc.club_id);
  assert.equal(j3.length, 20);
  assert.equal(new Set(j3).size, 20);
  for (const id of j3) {
    const club = data.clubs.find((c) => c.id === id);
    assert.ok(club?.home_stadium_id, `${id} にホームスタジアムがない`);
  }
});
