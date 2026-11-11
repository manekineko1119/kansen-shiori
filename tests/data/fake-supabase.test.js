import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeClient } from '../helpers/fake-supabase.js';

test('偽物：insert・update・delete が表を変え、calls に残る', async () => {
  const tables = { trips: [{ id: 1, title: 'a', user_id: 'u1' }] };
  const c = fakeClient(tables);
  await c.from('trips').insert({ id: 2, title: 'b', user_id: 'u1' });
  assert.equal(tables.trips.length, 2);
  await c.from('trips').update({ title: 'c' }).eq('id', 2);
  assert.equal(tables.trips[1].title, 'c');
  const del = await c.from('trips').delete().eq('id', 1);
  assert.deepEqual(tables.trips.map((r) => r.id), [2]);
  assert.equal(del.error, null);
  assert.deepEqual(c.calls.map((x) => x.op), ['insert', 'update', 'delete']);
});

test('偽物：表の failOn・throwOn が書き込みにも効く', async () => {
  const c = fakeClient({ trips: [] }, { failOn: { trips: { code: '42501', message: 'x' } } });
  assert.equal((await c.from('trips').insert({ id: 1 })).error.code, '42501');
  const t = fakeClient({ trips: [] }, { throwOn: ['trips'] });
  await assert.rejects(async () => t.from('trips').delete().eq('id', 1), TypeError);
});

test('偽物：rpc と functions.invoke', async () => {
  const c = fakeClient({}, { rpcs: { admin_photo_usage: () => 12 }, functions: { 'sync-results': () => ({ ok: true }) }, failOn: { 'sync-videos': { message: 'boom' } }, throwOn: ['admin_allowed_emails'] });
  assert.deepEqual(await c.rpc('admin_photo_usage', { a: 1 }), { data: 12, error: null });
  assert.deepEqual((await c.functions.invoke('sync-results', { body: {} })).data, { ok: true });
  assert.equal((await c.functions.invoke('sync-videos', {})).error.message, 'boom');
  await assert.rejects(async () => c.rpc('admin_allowed_emails'), TypeError);
  assert.deepEqual(c.calls.map((x) => x.op), ['rpc', 'invoke', 'invoke', 'rpc']);
  assert.deepEqual(c.calls[0].args, { a: 1 });
});

test('偽物：storage の upload・remove・createSignedUrl', async () => {
  const c = fakeClient({}, { failOn: { 'broken-bucket': { message: 'x' } } });
  const b = c.storage.from('record-photos');
  assert.equal((await b.upload('u1/a.jpg', 'FILE', { contentType: 'image/jpeg' })).error, null);
  assert.equal(c.storage.objects['record-photos']['u1/a.jpg'], 'FILE');
  assert.match((await b.createSignedUrl('u1/a.jpg', 3600)).data.signedUrl, /u1\/a\.jpg/);
  await b.remove(['u1/a.jpg']);
  assert.deepEqual(c.storage.objects['record-photos'], {});
  assert.equal((await c.storage.from('broken-bucket').upload('p', 'f')).error.message, 'x');
  assert.deepEqual(c.calls.map((x) => x.op), ['upload', 'signedUrl', 'remove', 'upload']);
});
