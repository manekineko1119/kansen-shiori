// 管理画面の読み取りをメモリに覚える（6-12）。描き直しのたびに読み直さず、読み終わったら onChange
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAdminCache } from '../../src/data/admin-cache.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

function fakeStore(over = {}) {
  const calls = [];
  return {
    calls,
    loadTesters: async () => { calls.push('testers'); return { ok: true, testers: [] }; },
    loadSyncStatus: async (day) => { calls.push(`sync:${day}`); return { ok: true, runs: [], videoLast: null }; },
    loadPhotoUsage: async () => { calls.push('photos'); return { ok: true, bytes: 1 }; },
    runSyncNow: async (club) => { calls.push(`run:${club}`); return { ok: true, result: { ok: true, message: 'm', skippedReason: null } }; },
    ...over,
  };
}

test('読み込み中は undefined、読み終わると値と onChange。同じものは1回だけ読む', async () => {
  const store = fakeStore();
  let changed = 0;
  const cache = createAdminCache({ store: () => store, onChange: () => { changed += 1; } });
  assert.equal(cache.testers(), undefined);
  assert.equal(cache.testers(), undefined);
  await tick();
  assert.deepEqual(cache.testers(), { ok: true, testers: [] });
  assert.deepEqual([store.calls, changed], [['testers'], 1]);
});

test('取り込みの状況は日（日本時間の 0 時）ごとに覚える', async () => {
  const store = fakeStore();
  const cache = createAdminCache({ store: () => store, onChange: () => {} });
  cache.syncStatus('2026-11-11T15:00:00.000Z');
  await tick();
  assert.equal(cache.syncStatus('2026-11-11T15:00:00.000Z').ok, true);
  assert.equal(cache.syncStatus('2026-11-12T15:00:00.000Z'), undefined);
  assert.deepEqual(store.calls, ['sync:2026-11-11T15:00:00.000Z', 'sync:2026-11-12T15:00:00.000Z']);
});

test('reset で読み直す（名前を渡せばそれだけ）', async () => {
  const store = fakeStore();
  const cache = createAdminCache({ store: () => store, onChange: () => {} });
  cache.testers(); cache.photoUsage();
  await tick();
  cache.reset('testers');
  assert.equal(cache.testers(), undefined);
  assert.equal(cache.photoUsage().ok, true);
  cache.reset();
  assert.equal(cache.photoUsage(), undefined);
});

test('今すぐ取り込む：結果が返るまで running。2回目は呼ばない。終わったら取り込みの状況を読み直す', async () => {
  let release;
  const store = fakeStore({ runSyncNow: (club) => { store.calls.push(`run:${club}`); return new Promise((r) => { release = r; }); } });
  let changed = 0;
  const cache = createAdminCache({ store: () => store, onChange: () => { changed += 1; } });
  cache.syncStatus('d');
  await tick();
  const first = cache.runNow('matsumoto');
  assert.equal(cache.run().running, true);
  assert.equal(await cache.runNow('matsumoto'), null); // 実行中は呼ばない
  release({ ok: true, result: { ok: false, message: '上限', skippedReason: 'limit' } });
  const res = await first;
  assert.deepEqual(res, { ok: true, result: { ok: false, message: '上限', skippedReason: 'limit' } });
  assert.deepEqual(cache.run(), { running: false, outcome: res });
  assert.equal(cache.syncStatus('d'), undefined); // 読み直す
  assert.deepEqual(store.calls.filter((c) => c.startsWith('run')), ['run:matsumoto']);
  assert.ok(changed >= 2);
});

test('今すぐ取り込む：例外でも running を戻す', async () => {
  const store = fakeStore({ runSyncNow: async () => { throw new Error('x'); } });
  const cache = createAdminCache({ store: () => store, onChange: () => {} });
  await assert.rejects(cache.runNow('matsumoto'));
  assert.equal(cache.run().running, false);
});

test('reset の前に読み始めた古い結果は捨てる', async () => {
  const releases = [];
  const store = fakeStore({ loadTesters: () => new Promise((r) => { releases.push(r); }) });
  const cache = createAdminCache({ store: () => store, onChange: () => {} });
  cache.testers();
  cache.reset('testers');
  cache.testers();
  releases[0]({ ok: true, testers: ['old'] });
  await tick();
  assert.equal(cache.testers(), undefined);
  releases[1]({ ok: true, testers: ['new'] });
  await tick();
  assert.deepEqual(cache.testers(), { ok: true, testers: ['new'] });
});

test('今すぐ取り込む：期限切れは結果として覚えない（押せる状態に戻し、呼んだ側が onExpired に渡す）', async () => {
  const store = fakeStore({ runSyncNow: async () => 'expired' });
  const cache = createAdminCache({ store: () => store, onChange: () => {} });
  assert.equal(await cache.runNow('matsumoto'), 'expired');
  assert.deepEqual(cache.run(), { running: false, outcome: null });
});
