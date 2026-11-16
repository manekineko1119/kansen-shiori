import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAdminStore } from '../../src/data/admin.js';
import { fakeClient } from '../helpers/fake-supabase.js';

const stadium = {
  id: 'gifu-memorial', name: '長良川競技場', prefecture: '岐阜県', address: '岐阜市', lat: 35.4, lng: 136.7,
  stations: [{ name: '名鉄岐阜', kind: 'shuttle', walk_min: null, note: null, toyoko: [] }], airports: [],
  access_url: null, shuttle_note: null, parking_note: null, agoda_area: { type: 'city', id: 1234 }, verified_at: '2026-11-11',
};
const club = { id: 'gifu', name: 'FC岐阜', short_name: '岐阜', aliases: ['FC GIFU'], official_url: null, jleague_url: null, home_stadium_id: 'gifu-memorial', video_sources: [] };

test('スタジアム：検証で止めたら送らない。通れば id で upsert する', async () => {
  const client = fakeClient({ stadiums: [] });
  const store = createAdminStore({ client });
  const bad = await store.saveStadium({ ...stadium, name: '', lat: NaN });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['lat', 'name']);
  assert.equal(client.calls.length, 0);
  assert.deepEqual(await store.saveStadium(stadium), { ok: true });
  const c = client.calls.at(-1);
  assert.deepEqual([c.table, c.op, c.onConflict], ['stadiums', 'upsert', 'id']);
  assert.deepEqual(c.rows, [stadium]);
});

test('スタジアム：送るのは表の列だけ（余計な項目・updated_at は送らない）', async () => {
  const client = fakeClient({ stadiums: [] });
  await createAdminStore({ client }).saveStadium({ ...stadium, extra: 1, updated_at: 'x' });
  assert.equal('extra' in client.calls[0].rows[0], false);
  assert.equal('updated_at' in client.calls[0].rows[0], false);
});

test('クラブ：検証で止める。theme_colors は送らない（上書きしない）', async () => {
  const client = fakeClient({ clubs: [] });
  const store = createAdminStore({ client });
  assert.deepEqual(Object.keys((await store.saveClub({ ...club, short_name: '' })).errors), ['short_name']);
  assert.equal(client.calls.length, 0);
  assert.deepEqual(await store.saveClub({ ...club, theme_colors: { primary: '#000000' } }), { ok: true });
  const c = client.calls.at(-1);
  assert.deepEqual([c.table, c.op, c.onConflict], ['clubs', 'upsert', 'id']);
  assert.deepEqual(c.rows, [club]);
});

test('保存の失敗：権限なし・期限切れ・通信できない', async () => {
  const denied = createAdminStore({ client: fakeClient({ clubs: [] }, { failOn: { clubs: { code: '42501', message: 'x' } } }) });
  assert.deepEqual(await denied.saveClub(club), { ok: false, errors: { _form: '権限がありません' } });
  const expired = createAdminStore({ client: fakeClient({ stadiums: [] }, { failOn: { stadiums: { code: 'PGRST303', message: 'jwt' } } }) });
  assert.equal(await expired.saveStadium(stadium), 'expired');
  const offline = createAdminStore({ client: fakeClient({ clubs: [] }, { throwOn: ['clubs'] }) });
  assert.match((await offline.saveClub(club)).errors._form, /通信できる場所/);
});

const season = { id: '2026-27', starts_on: '2026-08-01', ends_on: '2027-06-30', is_current: true };
const seasonTables = () => ({
  seasons: [{ ...season }],
  season_clubs: [
    { season_id: '2026-27', competition: 'J3', club_id: 'a' },
    { season_id: '2026-27', competition: 'J3', club_id: 'b' },
    { season_id: '2026-27', competition: 'J2', club_id: 'z' },
    { season_id: '2025', competition: 'J3', club_id: 'a' },
  ],
});

test('シーズン：seasons を upsert（is_current は触らない）し、所属は消す行を大会ごとに delete → 足す行を insert（設計書 3.4）', async () => {
  const client = fakeClient(seasonTables());
  // a：J3 → なし、b：J3 のまま、z：J2 → J1（大会が変わる）、c：なし → J3
  const res = await createAdminStore({ client }).saveSeason(season, { a: '', b: 'J3', z: 'J1', c: 'J3' });
  assert.deepEqual(res, { ok: true });
  const [up, read, del1, del2, ins] = client.calls;
  assert.deepEqual([up.table, up.op, up.onConflict], ['seasons', 'upsert', 'id']);
  assert.deepEqual(up.rows, [{ id: '2026-27', starts_on: '2026-08-01', ends_on: '2027-06-30' }]);
  assert.deepEqual([read.table, read.op, read.eq], ['season_clubs', 'select', [['season_id', '2026-27']]]);
  assert.deepEqual([del1.op, del1.eq, del1.in], ['delete', [['season_id', '2026-27'], ['competition', 'J3']], [['club_id', ['a']]]]);
  assert.deepEqual([del2.op, del2.eq, del2.in], ['delete', [['season_id', '2026-27'], ['competition', 'J2']], [['club_id', ['z']]]]);
  assert.deepEqual([ins.table, ins.op], ['season_clubs', 'insert']);
  assert.deepEqual(ins.values, [{ season_id: '2026-27', competition: 'J1', club_id: 'z' }, { season_id: '2026-27', competition: 'J3', club_id: 'c' }]);
  assert.equal(client.calls.length, 5);
});

test('シーズン：変えるクラブがなければ insert も delete もしない。選択肢にないクラブと、ほかのシーズンの所属は残る', async () => {
  const tables = seasonTables();
  const client = fakeClient(tables);
  await createAdminStore({ client }).saveSeason(season, { a: 'J3', b: 'J3' });
  assert.deepEqual(client.calls.map((c) => c.op), ['upsert', 'select']);
  const client2 = fakeClient(tables);
  await createAdminStore({ client: client2 }).saveSeason(season, { a: '', z: 'J3' });
  assert.deepEqual(tables.season_clubs.map((r) => `${r.season_id}/${r.competition}/${r.club_id}`).sort(), ['2025/J3/a', '2026-27/J3/b', '2026-27/J3/z']);
});

test('シーズン：検証で止める（IDの形・日付の前後）。新しいシーズンも作れる', async () => {
  const client = fakeClient({ seasons: [], season_clubs: [] });
  const store = createAdminStore({ client });
  const bad = await store.saveSeason({ id: 'x', starts_on: '2027-01-02', ends_on: '2027-01-01' }, {});
  assert.deepEqual(Object.keys(bad.errors).sort(), ['ends_on', 'id']);
  assert.equal(client.calls.length, 0);
  assert.deepEqual(await store.saveSeason({ id: '2027-28', starts_on: '2027-08-01', ends_on: '2028-06-30' }, { a: 'J2' }), { ok: true });
  assert.deepEqual(client.calls.map((c) => c.op), ['upsert', 'select', 'insert']);
});

test('シーズン：所属クラブの途中の失敗は理由を返す', async () => {
  const client = fakeClient(seasonTables(), { failOn: { season_clubs: { code: '23503', message: 'fk' } } });
  assert.deepEqual(await createAdminStore({ client }).saveSeason(season, { q: 'J3' }), { ok: false, errors: { _form: '入力の値を保存できませんでした' } });
});

test('今のシーズンの切り替え：今の is_current を false → 選んだものを true の2回の update', async () => {
  const tables = { seasons: [{ id: '2025', is_current: true }, { id: '2026-27', is_current: false }] };
  const client = fakeClient(tables);
  assert.deepEqual(await createAdminStore({ client }).setCurrentSeason('2026-27'), { ok: true });
  assert.deepEqual(client.calls.map((c) => [c.table, c.op, c.values, c.eq]), [
    ['seasons', 'update', { is_current: false }, [['is_current', true]]],
    ['seasons', 'update', { is_current: true }, [['id', '2026-27']]],
  ]);
  assert.deepEqual(tables.seasons.map((s) => s.is_current), [false, true]);
});

test('今のシーズンの切り替え：2回目が失敗したら1回目を戻す', async () => {
  const tables = { seasons: [{ id: '2025', is_current: true }, { id: '2026-27', is_current: false }] };
  const client = fakeClient(tables, { failNth: { seasons: { n: 2, code: '42501', message: 'x' } } });
  assert.deepEqual(await createAdminStore({ client }).setCurrentSeason('2026-27'), { ok: false, errors: { _form: '権限がありません' } });
  assert.equal(client.calls.length, 3);
  assert.deepEqual([client.calls[2].values, client.calls[2].eq], [{ is_current: true }, [['id', '2025']]]);
  assert.deepEqual(tables.seasons.map((s) => s.is_current), [true, false]);
});

test('今のシーズンの切り替え：1回目が失敗したら2回目はしない（期限切れ）', async () => {
  const tables = { seasons: [{ id: '2025', is_current: true }, { id: '2026-27', is_current: false }] };
  const first = fakeClient(tables, { failNth: { seasons: { n: 1, code: 'PGRST303', message: 'jwt' } } });
  assert.equal(await createAdminStore({ client: first }).setCurrentSeason('2026-27'), 'expired');
  assert.equal(first.calls.length, 1);
  assert.deepEqual(tables.seasons.map((s) => s.is_current), [true, false]);
});

test('今のシーズンの切り替え：今のシーズンがなかった（戻す先がない）ときも、2回目の失敗を返す', async () => {
  const tables = { seasons: [{ id: '2026-27', is_current: false }] };
  const client = fakeClient(tables, { failNth: { seasons: { n: 2, code: '42501', message: 'x' } } });
  assert.deepEqual(await createAdminStore({ client }).setCurrentSeason('2026-27'), { ok: false, errors: { _form: '権限がありません' } });
  assert.equal(client.calls.length, 2);
});

test('今のシーズンの切り替え：選んだ id がなければ（0件の更新）失敗として、1回目を戻す', async () => {
  const tables = { seasons: [{ id: '2025', is_current: true }] };
  const client = fakeClient(tables);
  assert.deepEqual(await createAdminStore({ client }).setCurrentSeason('2030'), { ok: false, errors: { _form: '入力の値を保存できませんでした' } });
  assert.deepEqual(tables.seasons, [{ id: '2025', is_current: true }]);
});

test('今のシーズンの切り替え：id が空なら送らない', async () => {
  const client = fakeClient({ seasons: [] });
  assert.ok((await createAdminStore({ client }).setCurrentSeason('')).errors.id);
  assert.equal(client.calls.length, 0);
});

// --- 日程（6-11。設計書 3.4・5.5・9章） ---
const fxClubIds = new Set(['a', 'b']);
const fxRow = (id, extra = {}) => ({
  id, season_id: '2026-27', competition: 'J3', round: '1', match_date: '2026-08-08', kickoff: '18:00', home_club_id: 'a', away_club_id: 'b',
  venue_stadium_id: null, venue_name_override: null, jleague_match_url: null, ...extra,
});

test('日程の1件：新規は insert、同じ ID があれば理由を出す。検証で止めたら送らない', async () => {
  const client = fakeClient({ fixtures: [] });
  const store = createAdminStore({ client });
  const bad = await store.saveFixture(fxRow('X', { home_club_id: 'zz' }), { isNew: true, clubIds: fxClubIds });
  assert.ok(bad.errors.home_club_id);
  assert.equal(client.calls.length, 0);
  assert.deepEqual(await store.saveFixture(fxRow('X'), { isNew: true, clubIds: fxClubIds }), { ok: true });
  assert.deepEqual([client.calls[0].table, client.calls[0].op], ['fixtures', 'insert']);
  const dup = createAdminStore({ client: fakeClient({ fixtures: [] }, { failOn: { fixtures: { code: '23505', message: 'dup' } } }) });
  assert.match((await dup.saveFixture(fxRow('X'), { isNew: true, clubIds: fxClubIds })).errors._form, /すでに登録/);
});

test('日程の1件：編集は id で update（id・season_id は送らない）。RLS で0行なら権限なし', async () => {
  const client = fakeClient({ fixtures: [fxRow('X', { status: 'finished', home_score: 2 })] });
  const store = createAdminStore({ client });
  assert.deepEqual(await store.saveFixture(fxRow('X', { kickoff: '19:00' }), { isNew: false, clubIds: fxClubIds }), { ok: true });
  const c = client.calls.at(-1);
  assert.deepEqual([c.op, c.eq], ['update', [['id', 'X']]]);
  assert.equal('id' in c.values, false);
  assert.equal('season_id' in c.values, false);
  assert.equal('status' in c.values, false); // 状態を渡さなければ送らない
  const none = createAdminStore({ client: fakeClient({ fixtures: [] }) });
  assert.deepEqual(await none.saveFixture(fxRow('X'), { isNew: false, clubIds: fxClubIds }), { ok: false, errors: { _form: '権限がありません' } });
});

test('日程の削除：観戦記録・遠征予定がある試合（外部キー）は理由を出す', async () => {
  const ok = createAdminStore({ client: fakeClient({ fixtures: [fxRow('X')] }) });
  assert.deepEqual(await ok.deleteFixture('X'), { ok: true });
  const fk = createAdminStore({ client: fakeClient({ fixtures: [fxRow('X')] }, { failOn: { fixtures: { code: '23503', message: 'fk' } } }) });
  assert.match((await fk.deleteFixture('X')).errors._form, /観戦記録か遠征予定/);
  const none = createAdminStore({ client: fakeClient({ fixtures: [] }) });
  assert.deepEqual(await none.deleteFixture('X'), { ok: false, errors: { _form: '権限がありません' } });
});

test('日程の取り込み：エラー行があるときは、除くと選ぶまで送らない', async () => {
  const client = fakeClient({ fixtures: [] });
  const store = createAdminStore({ client });
  const plan = { insert: [fxRow('A')], update: [], errors: [{ line: 3, reason: 'x' }] };
  assert.match((await store.importFixtures(plan)).errors._form, /エラーの行/);
  assert.equal(client.calls.length, 0);
  assert.deepEqual(await store.importFixtures(plan, { skipErrors: true }), { ok: true, inserted: 1, updated: 0 });
  assert.deepEqual(await store.importFixtures({ insert: [], update: [], errors: [] }), { ok: false, errors: { _form: '取り込む試合がありません' } });
});

test('日程の取り込み：100 件ずつ id で upsert し、列の違う行（URL を送らない上書き）は別に送る', async () => {
  const client = fakeClient({ fixtures: [] });
  const store = createAdminStore({ client });
  const insert = Array.from({ length: 150 }, (_, i) => fxRow(`N${i}`));
  const { jleague_match_url, ...noUrl } = fxRow('U');
  const res = await store.importFixtures({ insert, update: [noUrl], errors: [] });
  assert.deepEqual(res, { ok: true, inserted: 150, updated: 1 });
  const ups = client.calls.filter((c) => c.op === 'upsert');
  assert.deepEqual(ups.map((c) => [c.onConflict, c.rows.length]), [['id', 100], ['id', 50], ['id', 1]]);
  for (const c of ups) {
    const keys = new Set(c.rows.map((r) => Object.keys(r).sort().join(',')));
    assert.equal(keys.size, 1); // 1回の upsert の行は同じ列（足りない列を null にしないため）
  }
});

test('日程の取り込み：途中で失敗したら、どこまで入ったかを出す', async () => {
  const client = fakeClient({ fixtures: [] }, { failNth: { fixtures: { n: 2, message: 'x', code: '500' } } });
  const res = await createAdminStore({ client }).importFixtures({ insert: Array.from({ length: 150 }, (_, i) => fxRow(`N${i}`)), update: [], errors: [] });
  assert.equal(res.ok, false);
  assert.match(res.errors._form, /100 件/);
});

test('日程の削除の通信の失敗は、削除の文を返す', async () => {
  const s = createAdminStore({ client: fakeClient({ fixtures: [fxRow('X')] }, { throwOn: ['fixtures'] }) });
  assert.deepEqual(await s.deleteFixture('X'), { ok: false, errors: { _form: '削除できませんでした。通信できる場所でもう一度削除してください' } });
});

// --- URL での登録（設計書 3.4・6.2） ---
const httpErr = (status, body) => ({ name: 'FunctionsHttpError', message: 'non-2xx', context: { status, json: async () => body } });

test('試合ページの読み込み：import-match を { url } で呼び、ページを返す', async () => {
  const reply = { ok: true, url: 'https://www.jleague.jp/match/j3/2026/111/live/', page: { home: 'a' } };
  const client = fakeClient({}, { functions: { 'import-match': () => reply } });
  assert.deepEqual(await createAdminStore({ client }).readMatchPage('https://www.jleague.jp/match/j3/2026/111/live/'), reply);
  assert.deepEqual(client.calls, [{ op: 'invoke', name: 'import-match', opts: { body: { url: 'https://www.jleague.jp/match/j3/2026/111/live/' } } }]);
});

test('試合ページの読み込み：ok false は message を _form で返す。400・401・通信できない', async () => {
  const run = (opts) => createAdminStore({ client: fakeClient({}, opts) }).readMatchPage('u');
  assert.deepEqual(await run({ functions: { 'import-match': () => ({ ok: false, reason: 'limit', message: '今日の上限です' }) } }), { ok: false, errors: { _form: '今日の上限です' } });
  assert.deepEqual(await run({ functions: { 'import-match': () => ({ ok: false, reason: 'parse' }) } }), { ok: false, errors: { _form: '試合ページを読み込めませんでした' } });
  assert.deepEqual(await run({ failOn: { 'import-match': httpErr(400, { ok: false, reason: 'url', message: 'URL の形が違います' }) } }), { ok: false, errors: { _form: 'URL の形が違います' } });
  assert.equal(await run({ failOn: { 'import-match': httpErr(401, {}) } }), 'expired');
  assert.deepEqual(await run({ throwOn: ['import-match'] }), { ok: false, errors: { _form: '取り込みを実行できませんでした。通信できる場所でもう一度押してください' } });
});

test('URL での登録の保存：新規は insert(row)。同じ試合は「すでに登録されています」', async () => {
  const row = { id: 'x', home_club_id: 'a' };
  const client = fakeClient({ fixtures: [] });
  assert.deepEqual(await createAdminStore({ client }).saveMatchImport({ mode: 'insert', row }), { ok: true });
  assert.deepEqual([client.calls[0].op, client.calls[0].values], ['insert', row]);
  const dup = fakeClient({}, { failOn: { fixtures: { code: '23505', message: 'dup' } } });
  assert.deepEqual(await createAdminStore({ client: dup }).saveMatchImport({ mode: 'insert', row }), { ok: false, errors: { _form: 'この試合はすでに登録されています' } });
});

test('URL での登録の保存：更新は update(row).eq(id)。0 行なら権限なし', async () => {
  const client = fakeClient({ fixtures: [{ id: 'x', home_score: null }] });
  const store = createAdminStore({ client });
  assert.deepEqual(await store.saveMatchImport({ mode: 'update', id: 'x', row: { home_score: 2 } }), { ok: true });
  assert.deepEqual([client.calls[0].op, client.calls[0].values, client.calls[0].eq], ['update', { home_score: 2 }, [['id', 'x']]]);
  assert.deepEqual(await store.saveMatchImport({ mode: 'update', id: 'none', row: {} }), { ok: false, errors: { _form: '権限がありません' } });
});

test('今日の試合ページの数：results と match の pages_read の合計', async () => {
  const sync_runs = [
    { job: 'results', ran_at: '2026-11-11T20:00:00.000Z', pages_read: 4 },
    { job: 'match', ran_at: '2026-11-11T21:00:00.000Z', pages_read: 1 },
    { job: 'videos', ran_at: '2026-11-11T21:00:00.000Z', pages_read: 9 },
    { job: 'match', ran_at: '2026-11-10T21:00:00.000Z', pages_read: 1 },
  ];
  const client = fakeClient({ sync_runs });
  assert.deepEqual(await createAdminStore({ client }).loadMatchPagesToday('2026-11-11T15:00:00.000Z'), { ok: true, used: 5 });
  assert.deepEqual(await createAdminStore({ client: fakeClient({}, { throwOn: ['sync_runs'] }) }).loadMatchPagesToday('x'), { ok: false, message: '読み込めませんでした。通信できる場所で開き直してください' });
});

test('取り込みの状況：今日の match の試合ページ数を matchPagesToday で返す。runs には match の行を入れない', async () => {
  const sync_runs = [
    { id: 1, job: 'results', ran_at: '2026-11-11T20:00:00.000Z', pages_read: 2, list_read: 1 },
    { id: 2, job: 'match', ran_at: '2026-11-11T21:00:00.000Z', pages_read: 1, list_read: 0 },
    { id: 3, job: 'match', ran_at: '2026-11-11T22:00:00.000Z', pages_read: 1, list_read: 0 },
  ];
  const res = await createAdminStore({ client: fakeClient({ sync_runs }) }).loadSyncStatus('2026-11-11T15:00:00.000Z');
  assert.deepEqual([res.runs.map((r) => r.id), res.matchPagesToday], [[1], 2]);
});
