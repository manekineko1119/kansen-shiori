import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickSecretKey, authorizeCaller, jstDayStartIso, jstToday } from '../../supabase/functions/_shared/edge-auth.js';

const env = (o) => ({ get: (k) => o[k] });

test('pickSecretKey：新しい secret 鍵を優先する', () => {
  assert.equal(pickSecretKey(env({ SUPABASE_SECRET_KEYS: '{"default":"sb_secret_x"}', SUPABASE_SERVICE_ROLE_KEY: 'legacy' })), 'sb_secret_x');
});
test('pickSecretKey：従来の鍵に戻る', () => {
  assert.equal(pickSecretKey(env({ SUPABASE_SERVICE_ROLE_KEY: 'legacy' })), 'legacy');
  assert.equal(pickSecretKey(env({ SUPABASE_SECRET_KEYS: 'こわれた', SUPABASE_SERVICE_ROLE_KEY: 'legacy' })), 'legacy');
  assert.equal(pickSecretKey(env({ SUPABASE_SECRET_KEYS: '{"default":""}', SUPABASE_SERVICE_ROLE_KEY: 'legacy' })), 'legacy');
  assert.equal(pickSecretKey(env({ SUPABASE_SECRET_KEYS: '{"default":5}', SUPABASE_SERVICE_ROLE_KEY: 'legacy' })), 'legacy');
});
test('pickSecretKey：どちらもなければ null', () => {
  assert.equal(pickSecretKey(env({})), null);
  assert.equal(pickSecretKey(env({ SUPABASE_SERVICE_ROLE_KEY: '' })), null);
});

test('authorizeCaller：cron の合言葉', () => {
  assert.equal(authorizeCaller({ headerSecret: 's3cret', cronSecret: 's3cret', user: null }), 'cron');
  assert.equal(authorizeCaller({ headerSecret: 'x', cronSecret: 's3cret', user: null }), null);
  assert.equal(authorizeCaller({ headerSecret: 's3cret!', cronSecret: 's3cret', user: null }), null);
});
test('authorizeCaller：合言葉が未設定なら cron として通さない', () => {
  assert.equal(authorizeCaller({ headerSecret: '', cronSecret: '', user: null }), null);
  assert.equal(authorizeCaller({ headerSecret: null, cronSecret: null, user: null }), null);
});
test('authorizeCaller：管理者だけ通す', () => {
  assert.equal(authorizeCaller({ headerSecret: null, cronSecret: 's3cret', user: { app_metadata: { role: 'admin' } } }), 'admin');
  assert.equal(authorizeCaller({ headerSecret: null, cronSecret: 's3cret', user: { app_metadata: {} } }), null);
  assert.equal(authorizeCaller({ headerSecret: null, cronSecret: 's3cret', user: { } }), null);
});

test('jstDayStartIso：日本時間のその日の 0 時', () => {
  assert.equal(jstDayStartIso(Date.UTC(2026, 10, 9, 15, 30)), '2026-11-09T15:00:00.000Z');
  assert.equal(jstDayStartIso(Date.UTC(2026, 10, 9, 14, 59)), '2026-11-08T15:00:00.000Z');
});
test('jstToday：日本時間の日付', () => {
  assert.equal(jstToday(Date.UTC(2026, 10, 9, 15, 30)), '2026-11-10');
  assert.equal(jstToday(Date.UTC(2026, 10, 9, 14, 59)), '2026-11-09');
  assert.equal(jstToday(Date.UTC(2028, 1, 28, 15, 0)), '2028-02-29');
});
