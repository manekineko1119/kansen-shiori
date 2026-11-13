import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTripStore } from '../../src/data/trips.js';
import { fakeClient } from '../helpers/fake-supabase.js';

test('検証で止めたら送らない。title は前後の空白を取って送る', async () => {
  const client = fakeClient({ trips: [] });
  const store = createTripStore({ client });
  assert.deepEqual((await store.save({ title: ' ', fixture_id: 'a' })).errors, { title: 'タイトルは1〜50文字にしてください' });
  assert.equal(client.calls.length, 0);
  const res = await store.save({ fixture_id: 'a', title: '  岐阜遠征 ', modes: ['train'], lodging: 'post' });
  assert.deepEqual(res, { ok: true, id: 'id-1' });
  const c = client.calls.at(-1);
  assert.equal(c.op, 'insert');
  assert.equal('user_id' in c.values, false);
  assert.equal(c.values.title, '岐阜遠征');
  assert.deepEqual([c.values.fixture_id, c.values.custom_venue, c.values.custom_date], ['a', null, null]);
});

test('id があれば update（id で絞る）。空のメモは null', async () => {
  const client = fakeClient({ trips: [{ id: 't1', fixture_id: 'a', title: 'x' }] });
  const store = createTripStore({ client });
  const res = await store.save({ id: 't1', fixture_id: 'a', title: '岐阜遠征2', modes: [], lodging: 'none', memo: ' ', transport_memo: '特急' });
  assert.deepEqual(res, { ok: true, id: 't1' });
  const c = client.calls.at(-1);
  assert.deepEqual([c.op, c.eq], ['update', [['id', 't1']]]);
  assert.deepEqual([c.values.memo, c.values.transport_memo], [null, '特急']);
  assert.equal('id' in c.values, false);
});

test('custom_venue・custom_date だけでも保存できる。試合も会場もなければ止める', async () => {
  const client = fakeClient({ trips: [] });
  const store = createTripStore({ client });
  assert.equal((await store.save({ title: 'x', custom_venue: ' 長良川 ', custom_date: '2026-11-08' })).ok, true);
  const v = client.calls.at(-1).values;
  assert.deepEqual([v.custom_venue, v.custom_date, v.fixture_id], ['長良川', '2026-11-08', null]);
  const bad = await store.save({ title: 'x' });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['custom_date', 'custom_venue']);
});

test('期限切れは expired、通信の失敗・権限なしは理由を返す', async () => {
  const exp = { code: 'PGRST301', message: 'JWT expired' };
  assert.equal(await createTripStore({ client: fakeClient({ trips: [] }, { failOn: { trips: exp } }) }).save({ fixture_id: 'a', title: 'x' }), 'expired');
  assert.equal(await createTripStore({ client: fakeClient({ trips: [] }, { failOn: { trips: exp } }) }).remove('t1'), 'expired');
  const net = await createTripStore({ client: fakeClient({ trips: [] }, { throwOn: ['trips'] }) }).save({ fixture_id: 'a', title: 'x' });
  assert.deepEqual(net, { ok: false, errors: { _form: '保存できませんでした。通信できる場所でもう一度保存してください' } });
  const deny = await createTripStore({ client: fakeClient({ trips: [] }, { failOn: { trips: { code: '42501', message: 'rls' } } }) }).save({ fixture_id: 'a', title: 'x' });
  assert.deepEqual(deny.errors, { _form: '権限がありません' });
});

test('remove は id で削除する', async () => {
  const tables = { trips: [{ id: 't1' }, { id: 't2' }] };
  const client = fakeClient(tables);
  assert.deepEqual(await createTripStore({ client }).remove('t1'), { ok: true });
  assert.deepEqual([client.calls.at(-1).op, client.calls.at(-1).eq], ['delete', [['id', 't1']]]);
  assert.deepEqual(tables.trips.map((t) => t.id), ['t2']);
});

test('remove の通信の失敗は、削除の文を返す', async () => {
  const r = await createTripStore({ client: fakeClient({ trips: [{ id: 't1' }] }, { throwOn: ['trips'] }) }).remove('t1');
  assert.deepEqual(r, { ok: false, errors: { _form: '削除できませんでした。通信できる場所でもう一度削除してください' } });
});
