import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPersonalHolder } from '../../src/data/personal-holder.js';
import { createSnapshot } from '../../src/data/snapshot.js';
import { fakeClient } from '../helpers/fake-supabase.js';
import { fakeKv } from '../helpers/fake-storage.js';

const T = Date.UTC(2026, 10, 10, 3, 0, 0);
const tick = () => new Promise((r) => setTimeout(r, 0));
const masters = { status: 'fresh', data: { fixtures: [{ id: 'a' }] } };

function setup({ tables, user, m = masters, kv = fakeKv(), opts } = {}) {
  const env = { user, masters: m, changes: 0 };
  const client = fakeClient(tables ?? { trips: [{ id: 't1', fixture_id: 'a' }], match_records: [] }, opts);
  const holder = createPersonalHolder({
    client: () => client, getSnapshot: () => createSnapshot(kv), getUser: () => env.user, getMasters: () => env.masters,
    now: () => T, onChange: () => { env.changes += 1; },
  });
  return { env, holder, client, kv };
}

test('ログイン中：loading → 読めたら fresh。同じ利用者なら読み直さない', async () => {
  const { env, holder, client } = setup({ user: { id: 'u1' } });
  holder.sync();
  assert.deepEqual(holder.current, { status: 'loading' });
  await tick();
  assert.equal(holder.current.status, 'fresh');
  assert.deepEqual(holder.current.data.trips.map((t) => t.id), ['t1']);
  assert.equal(env.changes, 1);
  const n = client.calls.length;
  holder.sync();
  assert.equal(client.calls.length, n);
});

test('共通データがまだなら待つ。読めたあとの sync で読み始める', async () => {
  const { env, holder, client } = setup({ user: { id: 'u1' }, m: null });
  holder.sync();
  await tick();
  assert.equal(client.calls.length, 0);
  assert.equal(holder.current.status, 'loading');
  env.masters = masters;
  holder.sync();
  await tick();
  assert.equal(holder.current.status, 'fresh');
});

test('利用者が変わったら前の人のものを捨てる。読み終えたときに利用者が替わっていたら採らない', async () => {
  const { env, holder } = setup({ user: { id: 'u1' } });
  holder.sync();
  await tick();
  env.user = null;
  holder.sync();
  assert.equal(holder.current, null);
  env.user = { id: 'u1' };
  holder.sync();
  env.user = { id: 'u2' };
  holder.sync(); // u1 の読み込みの途中で u2 になった
  assert.deepEqual(holder.current, { status: 'loading' });
  await tick();
  assert.equal(holder.current.status, 'fresh'); // u2 の読み込みの結果だけ
});

test('オフライン：写しだけを出し通信しない。写しがなければ unavailable', async () => {
  const kv = fakeKv();
  const a = setup({ user: { id: 'u1' }, kv });
  a.holder.sync();
  await tick();
  const { env, holder, client } = setup({ user: { id: 'u1', offline: true }, kv });
  holder.sync();
  await tick();
  assert.equal(client.calls.length, 0);
  assert.deepEqual([holder.current.status, holder.current.label], ['offline', 'オフライン（最終更新：11月10日）']);
  assert.deepEqual(holder.current.data.trips.map((t) => t.id), ['t1']);
  env.user = { id: 'u9', offline: true };
  holder.sync();
  await tick();
  assert.deepEqual(holder.current, { status: 'unavailable', message: '初回は通信できる場所で開いてください' });
});

test('reload：保存のあとに読み直し、今のものを差し替える', async () => {
  const tables = { trips: [{ id: 't1', fixture_id: 'a' }], match_records: [] };
  const { holder } = setup({ user: { id: 'u1' }, tables });
  holder.sync();
  await tick();
  tables.trips.push({ id: 't2', fixture_id: 'a' });
  await holder.reload();
  assert.deepEqual(holder.current.data.trips.map((t) => t.id), ['t1', 't2']);
});

// 読み込みを手で終わらせられる偽物。from() を呼んだ時点の利用者の中身を、release のときに返す
function gatedSetup(user) {
  const env = { user, changes: 0 };
  const rows = { u1: { trips: [{ id: 'u1-trip', fixture_id: 'a' }], match_records: [] }, u2: { trips: [{ id: 'u2-trip', fixture_id: 'a' }], match_records: [] } };
  const gates = {};
  const client = {
    from(table) {
      const owner = env.user?.id;
      const q = {
        select() { return q; },
        in() { return q; },
        then(res, rej) {
          return new Promise((ok) => { (gates[owner] ??= []).push(() => ok({ data: rows[owner][table] ?? [], error: null })); }).then(res, rej);
        },
      };
      return q;
    },
  };
  const holder = createPersonalHolder({
    client: () => client, getSnapshot: () => createSnapshot(fakeKv()), getUser: () => env.user, getMasters: () => masters,
    now: () => T, onChange: () => { env.changes += 1; },
  });
  const release = async (owner) => { for (const g of gates[owner] ?? []) g(); gates[owner] = []; await tick(); await tick(); };
  return { env, holder, release };
}

test('読み込み中に利用者が替わったら、前の人の結果を採らない（中身の違う u1・u2。u1 を後に終わらせる）', async () => {
  const { env, holder, release } = gatedSetup({ id: 'u1' });
  holder.sync();
  env.user = { id: 'u2' };
  holder.sync();
  await release('u2');
  await release('u1');
  assert.deepEqual(holder.current.data.trips.map((t) => t.id), ['u2-trip']);
});

test('読み込み中にログアウト（null）になったら採らない', async () => {
  const { env, holder, release } = gatedSetup({ id: 'u1' });
  holder.sync();
  env.user = null;
  holder.sync();
  await release('u1');
  assert.equal(holder.current, null);
});

test('読み込み中に online から offline に替わったら、online の結果を採らない', async () => {
  const { env, holder, release } = gatedSetup({ id: 'u1' });
  holder.sync();
  env.user = { id: 'u1', offline: true };
  holder.sync();
  await tick();
  assert.equal(holder.current.status, 'unavailable'); // 写しなし
  await release('u1');
  assert.equal(holder.current.status, 'unavailable');
});

test('共通データの試合 ID の集合が変わったら（写し → 最新・現在のシーズンの切り替え）同じ利用者でも読み直す（M-2）', async () => {
  const { env, holder, client } = setup({ user: { id: 'u1' } });
  holder.sync();
  await tick();
  const n = client.calls.length;
  holder.sync();
  assert.equal(client.calls.length, n); // 同じ集合なら読まない
  env.masters = { status: 'fresh', data: { fixtures: [{ id: 'b' }] } };
  holder.sync();
  await tick();
  assert.ok(client.calls.length > n);
  assert.equal(holder.current.status, 'fresh'); // 読み直すあいだも loading に戻さない
  const n2 = client.calls.length;
  holder.sync();
  assert.equal(client.calls.length, n2);
});

test('読み込みが重なっても、最後に始めた読み込みの結果だけ採用する（古いものが遅れて終わっても上書きしない）', async () => {
  const tables = { trips: [{ id: 't1', fixture_id: 'a' }], match_records: [] };
  const base = fakeClient(tables);
  let release;
  const gate = new Promise((r) => { release = r; });
  let n = 0;
  const client = {
    ...base,
    from(t) {
      const q = base.from(t);
      if (t !== 'trips' || (n += 1) !== 1) return q;
      const w = { select() { q.select(); return w; }, then(res, rej) { return new Promise((ok, no) => q.then(ok, no)).then((v) => gate.then(() => v)).then(res, rej); } };
      return w;
    },
  };
  const env = { user: { id: 'u1' }, masters };
  const holder = createPersonalHolder({
    client: () => client, getSnapshot: () => createSnapshot(fakeKv()), getUser: () => env.user, getMasters: () => env.masters, now: () => T, onChange: () => {},
  });
  holder.sync(); // 1つ目：t1 だけ読んだ結果を、わざと遅らせる
  await tick();
  tables.trips.push({ id: 't2', fixture_id: 'a' });
  env.masters = { status: 'fresh', data: { fixtures: [{ id: 'b' }] } };
  holder.sync(); // 2つ目：t1・t2
  await tick();
  assert.deepEqual(holder.current.data.trips.map((t) => t.id), ['t1', 't2']);
  release();
  await tick();
  await tick();
  assert.deepEqual(holder.current.data.trips.map((t) => t.id), ['t1', 't2']);
});
