import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSnapshot, offlineLabel, SNAPSHOT_KEYS } from '../../src/data/snapshot.js';
import { fakeKv } from '../helpers/fake-storage.js';

test('日本時間で日付を出す', () => {
  assert.equal(offlineLabel(Date.UTC(2026, 10, 10, 15, 0)), 'オフライン（最終更新：11月11日）');
  assert.equal(offlineLabel(Date.UTC(2026, 10, 10, 14, 59)), 'オフライン（最終更新：11月10日）');
});

test('保存する名前', () => {
  assert.equal(SNAPSHOT_KEYS.masters, 'masters');
  assert.equal(SNAPSHOT_KEYS.personal('u1'), 'personal:u1');
});

test('保存して読める。remove のあとは null', async () => {
  const s = createSnapshot(fakeKv());
  await s.save('k', { a: 1 }, 123);
  assert.deepEqual(await s.load('k'), { savedAt: 123, data: { a: 1 } });
  await s.remove('k');
  assert.equal(await s.load('k'), null);
});

test('形の違う値は null', async () => {
  const kv = fakeKv();
  await kv.set('a', { savedAt: 'x', data: 1 });
  await kv.set('b', 'text');
  await kv.set('c', { savedAt: 1 });
  const s = createSnapshot(kv);
  assert.equal(await s.load('a'), null);
  assert.equal(await s.load('b'), null);
  assert.equal(await s.load('c'), null);
  assert.equal(await s.load('none'), null);
});

test('data が null や値でないものは null', async () => {
  const kv = fakeKv();
  await kv.set('a', { savedAt: 1, data: null });
  await kv.set('b', { savedAt: 1, data: 'x' });
  const s = createSnapshot(kv);
  assert.equal(await s.load('a'), null);
  assert.equal(await s.load('b'), null);
});

test('kv が読めずに投げても null', async () => {
  const s = createSnapshot({ get: async () => { throw new Error('x'); } });
  assert.equal(await s.load('a'), null);
});

// ログアウトで消せなかった個人の写しを、次に開いたときに消す（Codex のレビュー、設計書 4.5）
test('removeAllPersonal：personal: で始まる写しだけを、どのアカウントのものでも消す', async () => {
  const kv = fakeKv();
  const s = createSnapshot(kv);
  await s.save('masters', { clubs: [] }, 1);
  await s.save(SNAPSHOT_KEYS.personal('u1'), { trips: [] }, 1);
  await s.save(SNAPSHOT_KEYS.personal('u2'), { trips: [] }, 1);
  assert.equal(await s.removeAllPersonal(), 2);
  assert.deepEqual([...kv._map.keys()], ['masters']);
  assert.equal(await s.removeAllPersonal(), 0);
});

test('removeAllPersonal：一覧を出せない Kv（keys がない）では何もしない', async () => {
  const kv = { get: async () => undefined, set: async () => {}, delete: async () => {} };
  assert.equal(await createSnapshot(kv).removeAllPersonal(), 0);
});
