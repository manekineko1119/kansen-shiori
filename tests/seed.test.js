import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateStadium, validateClub } from '../src/core/validate.js';
import { buildSeedSql } from '../scripts/seed-sql.js';
import { normalizeName } from '../supabase/functions/_shared/text.js';

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

// ---- J1〜J3 の60クラブ（設計書 11.4「昇格・降格への備え」。計画 2026-11-11-all-clubs-initial-data の A-2）----

const seasonIds = (comp) => data.season_clubs
  .filter((sc) => sc.season_id === '2026-27' && sc.competition === comp).map((sc) => sc.club_id);
const clubNames = (c) => [...new Set([c.name, c.short_name, ...(c.aliases ?? [])].map(normalizeName))];

test('2026-27 の所属は J1・J2・J3 とも20クラブで、どのクラブにもホームスタジアムがある', () => {
  for (const comp of ['J1', 'J2', 'J3']) {
    const ids = seasonIds(comp);
    assert.equal(ids.length, 20, comp);
    for (const id of ids) assert.ok(data.clubs.find((c) => c.id === id)?.home_stadium_id, `${comp} ${id}`);
  }
});

test('1つのクラブは、同じシーズンに1つの大会にだけ所属する', () => {
  const ids = data.season_clubs.filter((sc) => sc.season_id === '2026-27').map((sc) => sc.club_id);
  assert.equal(new Set(ids).size, ids.length);
});

test('クラブの id は、Jリーグ公式のクラブページの URL と同じ（設計書 4.4）', () => {
  for (const c of data.clubs) assert.equal(c.jleague_url, `https://www.jleague.jp/club/${c.id}/`, c.id);
});

test('名前・略称・別名は、全クラブで重ならない（normalizeName でそろえて比べる。試合結果の照合で取り違えない）', () => {
  const seen = new Map();
  for (const c of data.clubs) {
    for (const n of clubNames(c)) {
      assert.ok(!seen.has(n), `「${n}」が ${seen.get(n)} と ${c.id} で重なる`);
      seen.set(n, c.id);
    }
  }
});

test('ほかのクラブの名前の一部になる名前は、分かっている C大阪 ⊂ FC大阪 だけ（試合動画はタイトルに含まれるかで判定するため）', () => {
  const found = [];
  for (const a of data.clubs) for (const b of data.clubs) {
    if (a.id === b.id) continue;
    for (const x of clubNames(a)) for (const y of clubNames(b)) if (y !== x && y.includes(x)) found.push(`${a.id}:${x}⊂${b.id}:${y}`);
  }
  assert.deepEqual(found, ['cosaka:c大阪⊂fosaka:fc大阪']);
});

test('地名だけの別名（栃木・大阪・東京・横浜・川崎）は、どのクラブにも入れない', () => {
  for (const c of data.clubs) {
    for (const n of ['栃木', '大阪', '東京', '横浜', '川崎']) assert.ok(!clubNames(c).includes(n), `${c.id} に「${n}」`);
  }
});

test('スタジアムの名前と住所は重ならない', () => {
  for (const key of ['name', 'address']) {
    const vals = data.stadiums.map((s) => normalizeName(s[key]));
    assert.equal(new Set(vals).size, vals.length, key);
  }
});

test('スタジアムの住所は都道府県から書く', () => {
  for (const s of data.stadiums) assert.ok(s.address.startsWith(s.prefecture), s.id);
});

test('J3 の20クラブ・ホームスタジアム・所属は、J1・J2 を足す前と同じ', () => {
  const ids = new Set(seasonIds('J3'));
  const clubs = data.clubs.filter((c) => ids.has(c.id));
  const st = new Set(clubs.map((c) => c.home_stadium_id));
  const by = (a, b) => (a.id < b.id ? -1 : 1);
  const snap = JSON.stringify({
    clubs: [...clubs].sort(by),
    stadiums: data.stadiums.filter((s) => st.has(s.id)).sort(by),
    season_clubs: [...ids].sort(),
  });
  // J3 のデータの SHA-256。J3 の行を直したときは、この値も直す
  // 2026-11-12：d949fd1 の時点 → 白波スタジアムのアクセス先・駐車場・バス停を直した（research 奈良・鹿児島のスタジアムの確認）
  assert.equal(createHash('sha256').update(snap).digest('hex'), '65353418e51eb9d009ed6e0b1df4e05e93530a8cd645ae65ff4730e739be3ebc');
});

test('J1・J2 のクラブには theme_colors と試合動画の取得元を入れない（応援クラブにしたときに足す）', () => {
  for (const id of [...seasonIds('J1'), ...seasonIds('J2')]) {
    const c = data.clubs.find((x) => x.id === id);
    assert.equal(c.theme_colors ?? null, null, id);
    assert.deepEqual(c.video_sources, [], id); // DB は not null なので空の配列を入れる
  }
});
