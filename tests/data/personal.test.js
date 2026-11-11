import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refreshPersonal, readPersonalSnapshot } from '../../src/data/personal.js';
import { createSnapshot } from '../../src/data/snapshot.js';
import { fakeClient } from '../helpers/fake-supabase.js';
import { fakeKv } from '../helpers/fake-storage.js';

const T = Date.UTC(2026, 10, 10, 3, 0, 0);
const mk = () => ({
  trips: [{ id: 't1', fixture_id: 'old_1' }, { id: 't2', fixture_id: 'a' }],
  match_records: [{ id: 'r1', fixture_id: 'a' }],
  fixtures: [{ id: 'old_1', kickoff: '13:00:00' }],
});
const known = () => new Set(['a']);

test('今のシーズンにない試合を extraFixtures に入れ、写しに保存する', async () => {
  const snapshot = createSnapshot(fakeKv());
  const r = await refreshPersonal({ client: fakeClient(mk()), snapshot, userId: 'u1', nowMs: T, knownFixtureIds: known() });
  assert.equal(r.status, 'fresh');
  assert.deepEqual(r.data.extraFixtures.map((f) => [f.id, f.kickoff]), [['old_1', '13:00']]);
  assert.deepEqual(r.data.trips.map((t) => t.id), ['t1', 't2']);
  assert.deepEqual(r.data.records.map((x) => x.id), ['r1']);
  assert.deepEqual((await snapshot.load('personal:u1')).data, r.data);
});

test('通信できないときは写しを出す。写しの形が壊れていれば使わない', async () => {
  const snapshot = createSnapshot(fakeKv());
  const r = await refreshPersonal({ client: fakeClient(mk()), snapshot, userId: 'u1', nowMs: T, knownFixtureIds: known() });
  const off = await refreshPersonal({ client: fakeClient(mk(), { throwOn: ['trips'] }), snapshot, userId: 'u1', nowMs: T + 1000, knownFixtureIds: known() });
  assert.deepEqual([off.status, off.data], ['offline', r.data]);
  assert.equal(off.label, 'オフライン（最終更新：11月10日）');
  const err = await refreshPersonal({ client: fakeClient(mk(), { failOn: { match_records: { message: 'x' } } }), snapshot, userId: 'u1', nowMs: T, knownFixtureIds: known() });
  assert.equal(err.status, 'offline');
  await snapshot.save('personal:u1', { trips: 'x' }, T);
  assert.equal(await readPersonalSnapshot(snapshot, 'u1'), null);
});

test('写しなし＋通信できない → unavailable。別の人の写しは使わない', async () => {
  const snapshot = createSnapshot(fakeKv());
  await refreshPersonal({ client: fakeClient(mk()), snapshot, userId: 'u2', nowMs: T, knownFixtureIds: known() });
  const r = await refreshPersonal({ client: fakeClient(mk(), { throwOn: ['trips'] }), snapshot, userId: 'u1', nowMs: T, knownFixtureIds: known() });
  assert.deepEqual(r, { status: 'unavailable', message: '初回は通信できる場所で開いてください' });
  assert.equal(await readPersonalSnapshot(snapshot, 'u1'), null);
});

test('写しを保存できなくても最新を捨てない。足りない試合がなければ試合は読まない', async () => {
  const snapshot = { load: async () => null, save: async () => { throw new Error('quota'); } };
  const client = fakeClient({ trips: [{ id: 't2', fixture_id: 'a' }], match_records: [] });
  const warn = console.warn;
  console.warn = () => {};
  try {
    const r = await refreshPersonal({ client, snapshot, userId: 'u1', nowMs: T, knownFixtureIds: known() });
    assert.equal(r.status, 'fresh');
    assert.deepEqual(r.data.extraFixtures, []);
  } finally {
    console.warn = warn;
  }
  assert.equal(client.calls.some((c) => c.table === 'fixtures'), false);
});
