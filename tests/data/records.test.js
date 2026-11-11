import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecordStore } from '../../src/data/records.js';
import { fakeClient } from '../helpers/fake-supabase.js';

const ids = { homeClubId: 'nara', awayClubId: 'matsumoto' };
const edit = {
  fixture: { status: 'finished', home_score: 1, away_score: 3, scorers: [{ side: 'home', player: '田中', minute: '64', type: 'goal' }] },
  videos: { highlight: null, inside: 'https://youtu.be/x' },
};

test('save：検証で止めたら送らない。upsert は user_id・visibility・photo_path を送らない', async () => {
  const client = fakeClient({ match_records: [] });
  const store = createRecordStore({ client });
  const bad = await store.save({ fixture_id: 'f1', trip_id: null, watch_style: 'stadium', cost_goods: NaN });
  assert.equal(bad.errors.cost_goods, '費用は0以上の整数で入力してください');
  assert.equal(client.calls.length, 0);
  const res = await store.save({ fixture_id: 'f1', trip_id: 't1', watch_style: 'stadium', cost_transport: 1200, cost_food: undefined, memo: null });
  assert.equal(res.ok, true);
  const c = client.calls.at(-1);
  assert.deepEqual([c.table, c.op, c.onConflict], ['match_records', 'upsert', 'user_id,fixture_id']);
  assert.equal('user_id' in c.values, false);
  assert.equal('visibility' in c.values, false);
  assert.equal('photo_path' in c.values, false);
  assert.deepEqual([c.values.fixture_id, c.values.trip_id, c.values.cost_transport, c.values.cost_food, c.values.memo], ['f1', 't1', 1200, null, null]);
});

test('save：権限なしは { _form }、期限切れは expired、通信の失敗は理由つき', async () => {
  const rec = { fixture_id: 'f1', trip_id: null, watch_style: 'stadium' };
  const denied = createRecordStore({ client: fakeClient({}, { failOn: { match_records: { message: 'x', code: '42501' } } }) });
  assert.deepEqual(await denied.save(rec), { ok: false, errors: { _form: '権限がありません' } });
  const expired = createRecordStore({ client: fakeClient({}, { failOn: { match_records: { message: 'jwt', code: 'PGRST301' } } }) });
  assert.equal(await expired.save(rec), 'expired');
  const down = createRecordStore({ client: fakeClient({}, { throwOn: ['match_records'] }) });
  assert.equal((await down.save(rec)).ok, false);
});

test('remove：id で削除する', async () => {
  const client = fakeClient({ match_records: [{ id: 'r1' }, { id: 'r2' }] });
  const store = createRecordStore({ client });
  assert.deepEqual(await store.remove('r1'), { ok: true });
  const c = client.calls.at(-1);
  assert.deepEqual([c.op, c.eq], ['delete', [['id', 'r1']]]);
});

test('saveFixtureInfo：fixtures は side を club_id にして manual を付ける。inside は upsert、highlight は manual の行だけ delete', async () => {
  const client = fakeClient({ fixtures: [{ id: 'f1' }], fixture_videos: [] });
  const store = createRecordStore({ client });
  assert.deepEqual(await store.saveFixtureInfo('f1', edit, ids), { ok: true });
  const [fx, ...vids] = client.calls.filter((c) => c.op !== 'select');
  assert.deepEqual([fx.table, fx.op, fx.eq], ['fixtures', 'update', [['id', 'f1']]]);
  assert.deepEqual(fx.values, {
    status: 'finished', home_score: 1, away_score: 3,
    scorers: [{ club_id: 'nara', player: '田中', minute: '64', type: 'goal' }], result_source: 'manual',
  });
  const up = vids.find((c) => c.op === 'upsert');
  assert.deepEqual([up.table, up.onConflict, up.values], ['fixture_videos', 'fixture_id,kind', { fixture_id: 'f1', kind: 'inside', url: 'https://youtu.be/x', source: 'manual' }]);
  const del = vids.find((c) => c.op === 'delete');
  assert.deepEqual([del.table, del.eq], ['fixture_videos', [['fixture_id', 'f1'], ['kind', 'highlight'], ['source', 'manual']]]);
});

test('saveFixtureInfo：away の得点者は away のクラブ。検証で止めたら送らない', async () => {
  const client = fakeClient({ fixtures: [{ id: 'f1' }] });
  const store = createRecordStore({ client });
  const away = { ...edit, fixture: { ...edit.fixture, scorers: [{ side: 'away', player: '山田', minute: '90+2', type: 'penalty' }] } };
  await store.saveFixtureInfo('f1', away, ids);
  assert.deepEqual(client.calls.find((c) => c.op === 'update').values.scorers, [{ club_id: 'matsumoto', player: '山田', minute: '90+2', type: 'penalty' }]);
  const calls = client.calls.length;
  const bad = await store.saveFixtureInfo('f1', { ...edit, videos: { highlight: 'https://evil.example/', inside: null } }, ids);
  assert.ok(bad.errors.video_highlight);
  assert.equal(client.calls.length, calls);
});

test('saveFixtureInfo：RLS で0行しか更新されなかったとき（管理者でない）は権限なし。動画は触らない', async () => {
  const client = fakeClient({ fixtures: [], fixture_videos: [] });
  const store = createRecordStore({ client });
  assert.deepEqual(await store.saveFixtureInfo('f1', edit, ids), { ok: false, errors: { _form: '権限がありません' } });
  assert.equal(client.calls.some((c) => c.table === 'fixture_videos'), false);
});

test('saveFixtureInfo：期限切れ・動画の失敗', async () => {
  const expired = createRecordStore({ client: fakeClient({ fixtures: [{ id: 'f1' }] }, { failOn: { fixtures: { code: 'PGRST303' } } }) });
  assert.equal(await expired.saveFixtureInfo('f1', edit, ids), 'expired');
  const vfail = createRecordStore({ client: fakeClient({ fixtures: [{ id: 'f1' }] }, { failOn: { fixture_videos: { code: '42501' } } }) });
  assert.deepEqual(await vfail.saveFixtureInfo('f1', edit, ids), { ok: false, errors: { _form: '権限がありません' } });
});
