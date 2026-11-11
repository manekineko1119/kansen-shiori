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

test('シーズン：seasons を upsert（is_current は触らない）し、足りないクラブだけ insert・余分なクラブだけ delete する', async () => {
  const client = fakeClient(seasonTables());
  const res = await createAdminStore({ client }).saveSeason(season, ['b', 'c', 'd']);
  assert.deepEqual(res, { ok: true });
  const [up, read, ins, del] = client.calls;
  assert.deepEqual([up.table, up.op, up.onConflict], ['seasons', 'upsert', 'id']);
  assert.deepEqual(up.rows, [{ id: '2026-27', starts_on: '2026-08-01', ends_on: '2027-06-30' }]);
  assert.deepEqual([read.table, read.op, read.eq], ['season_clubs', 'select', [['season_id', '2026-27'], ['competition', 'J3']]]);
  assert.deepEqual([ins.table, ins.op], ['season_clubs', 'insert']);
  assert.deepEqual(ins.values, [{ season_id: '2026-27', competition: 'J3', club_id: 'c' }, { season_id: '2026-27', competition: 'J3', club_id: 'd' }]);
  assert.deepEqual([del.table, del.op, del.eq, del.in], ['season_clubs', 'delete', [['season_id', '2026-27'], ['competition', 'J3']], [['club_id', ['a']]]]);
  assert.equal(client.calls.length, 4);
});

test('シーズン：変えるクラブがなければ insert も delete もしない。ほかの大会の所属と、ほかのシーズンの所属は残る', async () => {
  const tables = seasonTables();
  const client = fakeClient(tables);
  await createAdminStore({ client }).saveSeason(season, ['a', 'b']);
  assert.deepEqual(client.calls.map((c) => c.op), ['upsert', 'select']);
  const client2 = fakeClient(tables);
  await createAdminStore({ client: client2 }).saveSeason(season, ['b']);
  assert.deepEqual(tables.season_clubs.map((r) => `${r.season_id}/${r.competition}/${r.club_id}`).sort(), ['2025/J3/a', '2026-27/J2/z', '2026-27/J3/b']);
});

test('シーズン：検証で止める（IDの形・日付の前後）。新しいシーズンも作れる', async () => {
  const client = fakeClient({ seasons: [], season_clubs: [] });
  const store = createAdminStore({ client });
  const bad = await store.saveSeason({ id: 'x', starts_on: '2027-01-02', ends_on: '2027-01-01' }, []);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['ends_on', 'id']);
  assert.equal(client.calls.length, 0);
  assert.deepEqual(await store.saveSeason({ id: '2027-28', starts_on: '2027-08-01', ends_on: '2028-06-30' }, ['a']), { ok: true });
  assert.deepEqual(client.calls.map((c) => c.op), ['upsert', 'select', 'insert']);
});

test('シーズン：所属クラブの途中の失敗は理由を返す', async () => {
  const client = fakeClient(seasonTables(), { failOn: { season_clubs: { code: '23503', message: 'fk' } } });
  assert.deepEqual(await createAdminStore({ client }).saveSeason(season, ['q']), { ok: false, errors: { _form: '入力の値を保存できませんでした' } });
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
