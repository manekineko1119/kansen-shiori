import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPhotoStore } from '../../src/data/photos.js';
import { fakeClient } from '../helpers/fake-supabase.js';

const BUCKET = 'record-photos';

test('upload：upsert・image/jpeg で自分のパスに上げる', async () => {
  const client = fakeClient({});
  const store = createPhotoStore({ client, userId: 'u1' });
  assert.deepEqual(await store.upload('f1', 'BLOB'), { ok: true, path: 'u1/f1.jpg' });
  const c = client.calls.find((x) => x.op === 'upload');
  assert.deepEqual([c.bucket, c.path, c.opts], [BUCKET, 'u1/f1.jpg', { upsert: true, contentType: 'image/jpeg' }]);
  assert.equal(client.storage.objects[BUCKET]['u1/f1.jpg'], 'BLOB');
});

test('upload：差し替えは同じパスに上書き（古いファイルが残らない）', async () => {
  const client = fakeClient({});
  const store = createPhotoStore({ client, userId: 'u1' });
  await store.upload('f1', 'OLD');
  await store.upload('f1', 'NEW');
  assert.deepEqual(Object.keys(client.storage.objects[BUCKET]), ['u1/f1.jpg']);
  assert.equal(client.storage.objects[BUCKET]['u1/f1.jpg'], 'NEW');
});

test('upload：失敗・通信の失敗は { ok: false, errors: { photo } }、期限切れは expired', async () => {
  const msg = { ok: false, errors: { photo: '写真をアップロードできませんでした' } };
  assert.deepEqual(await createPhotoStore({ client: fakeClient({}, { failOn: { [BUCKET]: { message: 'x' } } }), userId: 'u1' }).upload('f1', 'B'), msg);
  assert.deepEqual(await createPhotoStore({ client: fakeClient({}, { throwOn: [BUCKET] }), userId: 'u1' }).upload('f1', 'B'), msg);
  const expired = fakeClient({}, { failOn: { [BUCKET]: { message: 'jwt', status: 401 } } });
  assert.equal(await createPhotoStore({ client: expired, userId: 'u1' }).upload('f1', 'B'), 'expired');
});

test('remove：パスを消す。失敗は { ok: false }（投げない）', async () => {
  const client = fakeClient({});
  const store = createPhotoStore({ client, userId: 'u1' });
  await store.upload('f1', 'B');
  assert.deepEqual(await store.remove('u1/f1.jpg'), { ok: true });
  assert.deepEqual(client.storage.objects[BUCKET], {});
  assert.equal((await createPhotoStore({ client: fakeClient({}, { failOn: { [BUCKET]: { message: 'x' } } }), userId: 'u1' }).remove('p')).ok, false);
  assert.equal((await createPhotoStore({ client: fakeClient({}, { throwOn: [BUCKET] }), userId: 'u1' }).remove('p')).ok, false);
});

test('signedUrl：3600秒。取れなければ null。同じパスは覚えて通信しない', async () => {
  const client = fakeClient({});
  const store = createPhotoStore({ client, userId: 'u1' });
  const url = await store.signedUrl('u1/f1.jpg');
  assert.match(url, /u1\/f1\.jpg/);
  assert.equal(await store.signedUrl('u1/f1.jpg'), url);
  assert.deepEqual(client.calls.filter((x) => x.op === 'signedUrl').map((x) => [x.path, x.seconds]), [['u1/f1.jpg', 3600]]);
  assert.equal(await createPhotoStore({ client: fakeClient({}, { failOn: { [BUCKET]: { message: 'x' } } }), userId: 'u1' }).signedUrl('p'), null);
  assert.equal(await createPhotoStore({ client: fakeClient({}, { throwOn: [BUCKET] }), userId: 'u1' }).signedUrl('p'), null);
});

test('signedUrl：失敗は覚えない。有効期限の前に作り直す。差し替え・削除で覚えを捨てる', async () => {
  let now = 0;
  const client = fakeClient({});
  const store = createPhotoStore({ client, userId: 'u1', now: () => now });
  await store.signedUrl('u1/f1.jpg');
  now = 3500 * 1000; // 3600 秒の期限の前に作り直す
  await store.signedUrl('u1/f1.jpg');
  assert.equal(client.calls.filter((x) => x.op === 'signedUrl').length, 2);
  await store.upload('f1', 'NEW');
  await store.signedUrl('u1/f1.jpg');
  assert.equal(client.calls.filter((x) => x.op === 'signedUrl').length, 3);
  await store.remove('u1/f1.jpg');
  await store.signedUrl('u1/f1.jpg');
  assert.equal(client.calls.filter((x) => x.op === 'signedUrl').length, 4);
});
