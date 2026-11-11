import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsHolder } from '../../src/data/settings-holder.js';
import { DEFAULT_SETTINGS } from '../../src/data/settings.js';
import { fakeClient } from '../helpers/fake-supabase.js';
import { fakeLocal } from '../helpers/fake-storage.js';

const row = (id, station) => ({ ...DEFAULT_SETTINGS, user_id: id, origin_station: station });

test('未ログインでも最初に端末の値を読む', async () => {
  const local = fakeLocal({ 'kansen.settings': JSON.stringify({ origin_station: '塩尻' }) });
  let changed = 0;
  const h = createSettingsHolder({ client: () => null, local, getUserId: () => null, onChange: () => { changed++; } });
  assert.equal(h.current.origin_station, '松本');
  await h.sync();
  assert.equal(h.current.origin_station, '塩尻');
  assert.equal(changed, 1);
});

test('利用者が変わったら前の人の設定を捨てて読み直す', async () => {
  let uid = 'u1';
  const client = fakeClient({ user_settings: [row('u1', '岡谷'), row('u2', '諏訪')] });
  const h = createSettingsHolder({ client: () => client, local: fakeLocal(), getUserId: () => uid, onChange: () => {} });
  await h.sync();
  assert.equal(h.current.origin_station, '岡谷');
  uid = null; // ログアウト
  const p = h.sync();
  assert.equal(h.current.origin_station, '松本'); // 読み込み中は前の人の値を出さない
  await p;
  assert.equal(h.current.origin_station, '松本');
  uid = 'u2';
  await h.sync();
  assert.equal(h.current.origin_station, '諏訪');
});

test('読み込み中に利用者が変わったら、その結果は使わない', async () => {
  let uid = 'u1';
  const client = fakeClient({ user_settings: [row('u1', '岡谷')] });
  const h = createSettingsHolder({ client: () => client, local: fakeLocal(), getUserId: () => uid, onChange: () => {} });
  const p = h.sync();
  uid = null;
  await p;
  assert.equal(h.current.origin_station, '松本');
});

test('読み込みが投げても落ちず、既定値のまま', async () => {
  const client = fakeClient({}, { throwOn: ['user_settings'] });
  const h = createSettingsHolder({ client: () => client, local: fakeLocal(), getUserId: () => 'u1', onChange: () => {} });
  await h.sync();
  assert.equal(h.current.origin_station, '松本');
});
