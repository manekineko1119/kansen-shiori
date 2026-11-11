import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFixtureRow, readMastersSnapshot, refreshMasters, fetchFixturesByIds } from '../../src/data/masters.js';
import { createSnapshot } from '../../src/data/snapshot.js';
import { fakeClient } from '../helpers/fake-supabase.js';
import { fakeKv } from '../helpers/fake-storage.js';

const T = Date.UTC(2026, 10, 11, 3, 0);
const tables = () => ({
  seasons: [{ id: '2026-27', is_current: true }, { id: '2025', is_current: false }],
  clubs: [{ id: 'matsumoto' }, { id: 'gifu' }],
  stadiums: [{ id: 'gifu-memorial' }],
  season_clubs: [{ season_id: '2026-27', competition: 'J3', club_id: 'matsumoto' }, { season_id: '2025', competition: 'J3', club_id: 'gifu' }],
  fixtures: [
    { id: 'a', season_id: '2026-27', match_date: '2026-11-15', kickoff: '14:00:00', fixture_videos: [] },
    { id: 'b', season_id: '2025', match_date: '2025-11-15', kickoff: null, fixture_videos: [] },
  ],
});

test('kickoff を HH:MM にそろえる', () => {
  assert.equal(normalizeFixtureRow({ kickoff: '19:00:00' }).kickoff, '19:00');
  assert.equal(normalizeFixtureRow({ kickoff: null }).kickoff, null);
});

test('成功：今のシーズンの試合だけ、kickoff がそろい、保存される', async () => {
  const snapshot = createSnapshot(fakeKv());
  const r = await refreshMasters({ client: fakeClient(tables()), snapshot, nowMs: T });
  assert.equal(r.status, 'fresh');
  assert.deepEqual(r.data.fixtures.map((f) => [f.id, f.kickoff]), [['a', '14:00']]);
  assert.equal(r.data.season.id, '2026-27');
  assert.equal(r.data.clubs.length, 2);
  assert.deepEqual(r.data.seasonClubs.map((c) => c.club_id), ['matsumoto']);
  assert.equal((await snapshot.load('masters')).savedAt, T);
  assert.deepEqual((await readMastersSnapshot(snapshot)).data, r.data);
});

test('失敗・スナップショットあり → offline（日本時間の日付）', async () => {
  const snapshot = createSnapshot(fakeKv());
  const data = { season: null, clubs: [{ id: 'x' }], stadiums: [], seasonClubs: [], fixtures: [] };
  await snapshot.save('masters', data, Date.UTC(2026, 10, 10, 14, 59));
  const off = await refreshMasters({ client: fakeClient(tables(), { failOn: { fixtures: { message: 'x' } } }), snapshot, nowMs: T });
  assert.deepEqual([off.status, off.label], ['offline', 'オフライン（最終更新：11月10日）']);
  assert.deepEqual(off.data, data);
  assert.equal((await refreshMasters({ client: fakeClient(tables(), { throwOn: ['seasons'] }), snapshot, nowMs: T })).status, 'offline');
});

test('失敗・スナップショットなし → unavailable', async () => {
  assert.deepEqual(
    await refreshMasters({ client: fakeClient(tables(), { throwOn: ['seasons'] }), snapshot: createSnapshot(fakeKv()), nowMs: T }),
    { status: 'unavailable', message: '初回は通信できる場所で開いてください' },
  );
});

test('保存が投げても fresh と新しいデータを返す', async () => {
  const kv = fakeKv();
  kv.set = async () => { throw new Error('QuotaExceededError'); };
  const r = await refreshMasters({ client: fakeClient(tables()), snapshot: createSnapshot(kv), nowMs: T });
  assert.equal(r.status, 'fresh');
  assert.deepEqual(r.data.fixtures.map((f) => f.id), ['a']);
});

test('壊れた masters のスナップショット（clubs が配列でない）は null', async () => {
  const kv = fakeKv();
  await kv.set('masters', { savedAt: 1, data: { season: null, clubs: 'x', stadiums: [], seasonClubs: [], fixtures: [] } });
  assert.equal(await readMastersSnapshot(createSnapshot(kv)), null);
  await kv.set('masters', { savedAt: 1, data: { season: null, clubs: [], stadiums: [], seasonClubs: [], fixtures: [] } });
  assert.notEqual(await readMastersSnapshot(createSnapshot(kv)), null);
});

test('今のシーズンがなくても落ちない', async () => {
  const t = tables();
  t.seasons = [{ id: '2025', is_current: false }];
  const r = await refreshMasters({ client: fakeClient(t), snapshot: createSnapshot(fakeKv()), nowMs: T });
  assert.equal(r.status, 'fresh');
  assert.equal(r.data.season, null);
  assert.deepEqual(r.data.fixtures, []);
  assert.deepEqual(r.data.seasonClubs, []);
});

test('fetchFixturesByIds：空なら通信しない。ID 指定で読み kickoff をそろえる', async () => {
  const c1 = fakeClient(tables());
  assert.deepEqual(await fetchFixturesByIds({ client: c1 }, []), []);
  assert.equal(c1.calls.length, 0);
  const c2 = fakeClient(tables());
  const rows = await fetchFixturesByIds({ client: c2 }, ['a']);
  assert.deepEqual(rows.map((f) => [f.id, f.kickoff]), [['a', '14:00']]);
  assert.deepEqual(c2.calls[0].in, [['id', ['a']]]);
});
