import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsStore, DEFAULT_SETTINGS, SETTINGS_KEYS } from '../../src/data/settings.js';
import { fakeClient } from '../helpers/fake-supabase.js';
import { fakeLocal } from '../helpers/fake-storage.js';

test('既定値は設計書 4.2 と同じ', () => {
  assert.deepEqual(Object.keys(DEFAULT_SETTINGS), SETTINGS_KEYS);
  assert.equal(DEFAULT_SETTINGS.support_club_id, 'matsumoto');
  assert.equal(DEFAULT_SETTINGS.origin_station, '松本');
  assert.equal(DEFAULT_SETTINGS.origin_prefecture, '長野県');
  assert.deepEqual(DEFAULT_SETTINGS.origin_airports.map((a) => a.code), ['MMJ', 'NGO', 'HND']);
  assert.equal(DEFAULT_SETTINGS.airport_checkin_min, 60);
  assert.equal(DEFAULT_SETTINGS.airport_arrival_min, 20);
  assert.equal(DEFAULT_SETTINGS.arrive_before_min, 90);
  assert.deepEqual(DEFAULT_SETTINGS.default_modes, ['train']);
});

test('未ログイン：読み書きと検証', async () => {
  const local = fakeLocal();
  const st = createSettingsStore({ client: null, local, userId: null });
  assert.deepEqual(await st.load(), { settings: DEFAULT_SETTINGS, exists: false });
  assert.equal((await st.save({ ...DEFAULT_SETTINGS, origin_station: '塩尻', extra: 1 })).ok, true);
  assert.deepEqual(JSON.parse(local.getItem('kansen.settings')), { ...DEFAULT_SETTINGS, origin_station: '塩尻' });
  assert.equal((await st.load()).exists, true);
  const bad = await st.save({ ...DEFAULT_SETTINGS, origin_airports: [{ code: '1', access_min: 30 }] });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors['origin_airports.0.code']);
  assert.equal(JSON.parse(local.getItem('kansen.settings')).origin_station, '塩尻');
});

test('壊れた値・足りない項目は既定で補う', async () => {
  const broken = createSettingsStore({ client: null, local: fakeLocal({ 'kansen.settings': '{こわれた' }), userId: null });
  assert.deepEqual((await broken.load()).settings, DEFAULT_SETTINGS);
  const part = createSettingsStore({ client: null, local: fakeLocal({ 'kansen.settings': '{"origin_station":"岡谷"}' }), userId: null });
  const r = await part.load();
  assert.equal(r.settings.arrive_before_min, 90);
  assert.equal(r.settings.origin_station, '岡谷');
  const arr = createSettingsStore({ client: null, local: fakeLocal({ 'kansen.settings': '[1]' }), userId: null });
  assert.deepEqual((await arr.load()).settings, DEFAULT_SETTINGS);
});

test('ログイン：行なしは exists false で端末の設定が初期値', async () => {
  const local = fakeLocal({ 'kansen.settings': '{"origin_station":"塩尻"}' });
  const client = fakeClient({ user_settings: [] });
  const st = createSettingsStore({ client, local, userId: 'u1' });
  assert.deepEqual(await st.load(), { settings: { ...DEFAULT_SETTINGS, origin_station: '塩尻' }, exists: false });
});

test('ログイン：行があれば exists true で、その値を使う', async () => {
  const client = fakeClient({ user_settings: [{ user_id: 'u1', origin_station: '長野', updated_at: 'x' }] });
  const st = createSettingsStore({ client, local: fakeLocal(), userId: 'u1' });
  const r = await st.load();
  assert.equal(r.exists, true);
  assert.equal(r.settings.origin_station, '長野');
  assert.equal(r.settings.arrive_before_min, 90);
  assert.equal('updated_at' in r.settings, false);
});

test('ログイン：保存は upsert で user_id を送らない', async () => {
  const client = fakeClient({ user_settings: [] });
  const st = createSettingsStore({ client, local: fakeLocal(), userId: 'u1' });
  const r = await st.save({ ...DEFAULT_SETTINGS, extra: 1 });
  assert.equal(r.ok, true);
  const c = client.calls.at(-1);
  assert.equal(c.op, 'upsert');
  assert.equal('user_id' in c.values, false);
  assert.equal('extra' in c.values, false);
});

test('ログイン：検証に通らなければ送らない', async () => {
  const client = fakeClient({ user_settings: [] });
  const st = createSettingsStore({ client, local: fakeLocal(), userId: 'u1' });
  const r = await st.save({ ...DEFAULT_SETTINGS, origin_airports: [{ code: '1', access_min: 30 }] });
  assert.equal(r.ok, false);
  assert.equal(client.calls.length, 0);
});

test('ログイン：権限なし・通信失敗・その他のエラー', async () => {
  const mk = (opts) => createSettingsStore({ client: fakeClient({ user_settings: [] }, opts), local: fakeLocal(), userId: 'u1' });
  assert.deepEqual((await mk({ failOn: { user_settings: { code: '42501', message: 'x' } } }).save(DEFAULT_SETTINGS)).errors, { _form: '権限がありません' });
  assert.deepEqual((await mk({ throwOn: ['user_settings'] }).save(DEFAULT_SETTINGS)).errors, { _form: '保存できませんでした。通信できる場所でもう一度保存してください' });
  assert.deepEqual((await mk({ failOn: { user_settings: { message: 'boom' } } }).save(DEFAULT_SETTINGS)).errors, { _form: '保存できませんでした。通信できる場所でもう一度保存してください' });
});

test('端末の設定：型違いの項目だけ既定値に戻す', async () => {
  const local = fakeLocal({ 'kansen.settings': '{"origin_station":"岡谷","arrive_before_min":"abc","default_modes":3,"origin_airports":"x","airport_checkin_min":1.5,"support_club_id":7}' });
  const r = await createSettingsStore({ client: null, local, userId: null }).load();
  assert.equal(r.exists, true);
  assert.equal(r.settings.origin_station, '岡谷');
  assert.equal(r.settings.arrive_before_min, 90);
  assert.deepEqual(r.settings.default_modes, ['train']);
  assert.deepEqual(r.settings.origin_airports, DEFAULT_SETTINGS.origin_airports);
  assert.equal(r.settings.airport_checkin_min, 60);
  assert.equal(r.settings.support_club_id, 'matsumoto');
});

test('ログイン：範囲外の値は項目ごとの理由を返して送らない', async () => {
  const client = fakeClient({ user_settings: [] });
  const st = createSettingsStore({ client, local: fakeLocal(), userId: 'u1' });
  const r = await st.save({ ...DEFAULT_SETTINGS, airport_checkin_min: 999 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.airport_checkin_min);
  assert.equal(client.calls.length, 0);
});

test('ログイン：code 付きのエラー（42501 以外）は入力の確認を促す', async () => {
  const st = createSettingsStore({ client: fakeClient({ user_settings: [] }, { failOn: { user_settings: { code: '23514', message: 'check' } } }), local: fakeLocal(), userId: 'u1' });
  assert.deepEqual((await st.save(DEFAULT_SETTINGS)).errors, { _form: '保存できませんでした。入力を確かめてもう一度保存してください' });
});

test('ログイン：load の失敗は例外にせず exists null と error を返す', async () => {
  const local = fakeLocal({ 'kansen.settings': '{"origin_station":"塩尻"}' });
  const net = await createSettingsStore({ client: fakeClient({ user_settings: [] }, { throwOn: ['user_settings'] }), local, userId: 'u1' }).load();
  assert.equal(net.exists, null);
  assert.equal(net.error.code, 'network');
  assert.equal(net.settings.origin_station, '塩尻');
  const db = await createSettingsStore({ client: fakeClient({ user_settings: [] }, { failOn: { user_settings: { code: '42501', message: 'x' } } }), local, userId: 'u1' }).load();
  assert.equal(db.exists, null);
  assert.deepEqual(db.error, { code: '42501', message: 'x' });
  assert.equal(db.settings.origin_station, '塩尻');
});

test('保存：型違いの入力は既定値に置き換えず、検証で止める', async () => {
  for (const bad of ['abc', 1.5, null]) {
    const local = fakeLocal({ 'kansen.settings': '{"arrive_before_min":120}' });
    const st = createSettingsStore({ client: null, local, userId: null });
    const r = await st.save({ ...DEFAULT_SETTINGS, arrive_before_min: bad });
    assert.equal(r.ok, false);
    assert.ok(r.errors.arrive_before_min);
    assert.equal(JSON.parse(local.getItem('kansen.settings')).arrive_before_min, 120);
  }
  const client = fakeClient({ user_settings: [] });
  const r = await createSettingsStore({ client, local: fakeLocal(), userId: 'u1' }).save({ ...DEFAULT_SETTINGS, default_modes: 3 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.default_modes);
  assert.equal(client.calls.length, 0);
});
