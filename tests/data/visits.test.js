import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVisitStore } from '../../src/data/visits.js';
import { fakeClient } from '../helpers/fake-supabase.js';

test('add は stadium_visits に insert する。season_id が空なら null、user_id は送らない', async () => {
  const client = fakeClient({ stadium_visits: [] });
  const res = await createVisitStore({ client }).add({ stadium_id: 'gosta', season_id: '' });
  assert.deepEqual(res, { ok: true, id: 'id-1' });
  const c = client.calls.at(-1);
  assert.deepEqual([c.table, c.op], ['stadium_visits', 'insert']);
  assert.deepEqual(c.values, { stadium_id: 'gosta', season_id: null });
  assert.equal('user_id' in c.values, false);
});

test('season_id があればそのまま送る', async () => {
  const client = fakeClient({ stadium_visits: [] });
  await createVisitStore({ client }).add({ stadium_id: 'gosta', season_id: 's2026' });
  assert.deepEqual(client.calls.at(-1).values, { stadium_id: 'gosta', season_id: 's2026' });
});

test('stadium_id が空なら送らずに止める', async () => {
  const client = fakeClient({ stadium_visits: [] });
  const res = await createVisitStore({ client }).add({ stadium_id: '', season_id: '' });
  assert.deepEqual(res, { ok: false, errors: { stadium_id: '会場を選んでください' } });
  assert.equal(client.calls.length, 0);
});

test('remove は id で削除する', async () => {
  const tables = { stadium_visits: [{ id: 'v1' }, { id: 'v2' }] };
  const client = fakeClient(tables);
  assert.deepEqual(await createVisitStore({ client }).remove('v1'), { ok: true });
  assert.deepEqual([client.calls.at(-1).op, client.calls.at(-1).eq], ['delete', [['id', 'v1']]]);
  assert.deepEqual(tables.stadium_visits.map((v) => v.id), ['v2']);
});

test('エラーは toFormError の結果。期限切れは expired', async () => {
  const exp = { code: 'PGRST301', message: 'JWT expired' };
  const mkc = (opt) => createVisitStore({ client: fakeClient({ stadium_visits: [] }, opt) });
  assert.equal(await mkc({ failOn: { stadium_visits: exp } }).add({ stadium_id: 'g' }), 'expired');
  assert.equal(await mkc({ failOn: { stadium_visits: exp } }).remove('v1'), 'expired');
  const net = await mkc({ throwOn: ['stadium_visits'] }).add({ stadium_id: 'g' });
  assert.deepEqual(net, { ok: false, errors: { _form: '保存できませんでした。通信できる場所でもう一度保存してください' } });
  const deny = await mkc({ failOn: { stadium_visits: { code: '42501', message: 'rls' } } }).remove('v1');
  assert.deepEqual(deny.errors, { _form: '権限がありません' });
});
