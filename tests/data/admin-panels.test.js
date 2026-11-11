// 管理画面のテスター・取り込み・写真の使用量（6-12。設計書 3.4、D36・D37）のデータ層
// メールアドレスはすべて架空のもの
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAdminStore } from '../../src/data/admin.js';
import { fakeClient } from '../helpers/fake-supabase.js';

const testers = [
  { email: 'joined@example.test', note: 'Aさん', created_at: '2026-11-01T00:00:00Z', has_account: true },
  { email: 'waiting@example.test', note: null, created_at: '2026-11-02T00:00:00Z', has_account: false },
];

test('テスターの一覧：admin_allowed_emails を呼ぶ', async () => {
  const client = fakeClient({}, { rpcs: { admin_allowed_emails: () => testers } });
  assert.deepEqual(await createAdminStore({ client }).loadTesters(), { ok: true, testers });
  assert.deepEqual(client.calls, [{ op: 'rpc', name: 'admin_allowed_emails', args: undefined }]);
});

test('読み取りの失敗：権限なし・期限切れ・通信できない', async () => {
  const denied = fakeClient({}, { failOn: { admin_allowed_emails: { code: '42501', message: 'x' } } });
  assert.deepEqual(await createAdminStore({ client: denied }).loadTesters(), { ok: false, message: '権限がありません' });
  const expired = fakeClient({}, { failOn: { admin_photo_usage: { code: 'PGRST303', message: 'jwt' } } });
  assert.equal(await createAdminStore({ client: expired }).loadPhotoUsage(), 'expired');
  const offline = fakeClient({}, { throwOn: ['admin_photo_usage'] });
  assert.deepEqual(await createAdminStore({ client: offline }).loadPhotoUsage(), { ok: false, message: '読み込めませんでした。通信できる場所で開き直してください' });
});

test('テスターの追加：小文字にそろえて insert。メモの空は null', async () => {
  const client = fakeClient({ allowed_emails: [] });
  const store = createAdminStore({ client });
  assert.deepEqual(await store.addTester({ email: ' New@Example.TEST ', note: '  ' }), { ok: true });
  assert.deepEqual(client.calls[0].values, { email: 'new@example.test', note: null });
  await store.addTester({ email: 'b@example.test', note: ' Bさん ' });
  assert.deepEqual(client.calls[1].values, { email: 'b@example.test', note: 'Bさん' });
});

test('テスターの追加：形が違えば送らない。同じアドレスは「登録されています」', async () => {
  const client = fakeClient({ allowed_emails: [] }, { failOn: { allowed_emails: { code: '23505', message: 'duplicate' } } });
  const store = createAdminStore({ client });
  assert.deepEqual(await store.addTester({ email: 'not-mail', note: '' }), { ok: false, errors: { email: 'メールアドレスの形が正しくありません' } });
  assert.equal(client.calls.length, 0);
  assert.deepEqual(await store.addTester({ email: 'a@example.test', note: '' }), { ok: false, errors: { email: 'このメールアドレスはすでに登録されています' } });
});

test('テスターの削除：email で delete。消えた行がなければ権限なし', async () => {
  const client = fakeClient({ allowed_emails: [{ email: 'a@example.test' }] });
  const store = createAdminStore({ client });
  assert.deepEqual(await store.removeTester('a@example.test'), { ok: true });
  assert.deepEqual([client.calls[0].op, client.calls[0].eq], ['delete', [['email', 'a@example.test']]]);
  assert.deepEqual(await store.removeTester('a@example.test'), { ok: false, errors: { _form: '権限がありません' } });
});

test('取り込みの状況：今日の results の行と、最新の results・videos の行を読む', async () => {
  const sync_runs = [
    { id: 1, job: 'results', ran_at: '2026-11-10T22:00:00.000Z', ok: true, list_read: 1, pages_read: 0 },
    { id: 2, job: 'results', ran_at: '2026-11-11T22:00:00.000Z', ok: true, list_read: 1, pages_read: 2 },
    { id: 3, job: 'videos', ran_at: '2026-11-11T22:00:01.000Z', ok: true, list_read: 0, pages_read: 0 },
    { id: 4, job: 'videos', ran_at: '2026-11-10T22:00:01.000Z', ok: false, list_read: 0, pages_read: 0 },
  ];
  const client = fakeClient({ sync_runs });
  const res = await createAdminStore({ client }).loadSyncStatus('2026-11-11T15:00:00.000Z');
  assert.deepEqual(res.runs.map((r) => r.id), [2]);
  assert.equal(res.videoLast.id, 3);
  const q = client.calls.find((c) => c.gte.length);
  assert.deepEqual([q.eq, q.gte], [[['job', 'results']], [['ran_at', '2026-11-11T15:00:00.000Z']]]);
});

test('取り込みの状況：今日の行がなければ、昨日以前の最新の行を最後の結果に入れる', async () => {
  const sync_runs = [{ id: 1, job: 'results', ran_at: '2026-11-10T22:00:00.000Z', ok: false, list_read: 1, pages_read: 0 }];
  const res = await createAdminStore({ client: fakeClient({ sync_runs }) }).loadSyncStatus('2026-11-11T15:00:00.000Z');
  assert.deepEqual([res.runs.map((r) => r.id), res.videoLast], [[1], null]);
});

test('今すぐ取り込む：sync-results を応援クラブで呼び、応答を返す', async () => {
  const reply = { ok: true, message: '取り込みました', skipped_reason: null };
  const client = fakeClient({}, { functions: { 'sync-results': () => reply } });
  assert.deepEqual(await createAdminStore({ client }).runSyncNow('matsumoto'), { ok: true, result: { ok: true, message: '取り込みました', skippedReason: null } });
  assert.deepEqual(client.calls, [{ op: 'invoke', name: 'sync-results', opts: { body: { club_id: 'matsumoto' } } }]);
});

test('今すぐ取り込む：401 は期限切れ。ほかの失敗は応答の message、読めなければ決まった文。通信できないとき', async () => {
  const http = (status, body) => ({ name: 'FunctionsHttpError', message: 'non-2xx', context: { status, json: async () => body } });
  const call = (error) => createAdminStore({ client: fakeClient({}, { failOn: { 'sync-results': error } }) }).runSyncNow('matsumoto');
  assert.equal(await call(http(401, { ok: false, message: '認証できません' })), 'expired');
  assert.deepEqual(await call(http(500, { ok: false, message: '記録できませんでした：x' })), { ok: false, errors: { _form: '記録できませんでした：x' } });
  assert.deepEqual(await call({ name: 'FunctionsHttpError', context: { status: 502, json: async () => { throw new Error('html'); } } }),
    { ok: false, errors: { _form: '取り込みを実行できませんでした（502）' } });
  assert.deepEqual(await call({ name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' }),
    { ok: false, errors: { _form: '取り込みを実行できませんでした。通信できる場所でもう一度押してください' } });
  const thrown = createAdminStore({ client: fakeClient({}, { throwOn: ['sync-results'] }) });
  assert.match((await thrown.runSyncNow('matsumoto')).errors._form, /通信できる場所/);
});

test('今すぐ取り込む：応援クラブがなければ送らない', async () => {
  const client = fakeClient({});
  assert.deepEqual(await createAdminStore({ client }).runSyncNow(null), { ok: false, errors: { _form: '設定で応援クラブを選んでください' } });
  assert.equal(client.calls.length, 0);
});

test('得点者の失敗の印を空に戻す：fixtures の scorers_failed_at を null に。更新した行がなければ権限なし', async () => {
  const client = fakeClient({ fixtures: [{ id: 'f1', scorers_failed_at: '2026-11-10T00:00:00Z' }] });
  const store = createAdminStore({ client });
  assert.deepEqual(await store.clearScorersFailed('f1'), { ok: true });
  assert.deepEqual([client.calls[0].op, client.calls[0].values, client.calls[0].eq], ['update', { scorers_failed_at: null }, [['id', 'f1']]]);
  assert.deepEqual(await store.clearScorersFailed('nothing'), { ok: false, errors: { _form: '権限がありません' } });
});

test('写真の使用量：admin_photo_usage の数（null は 0、文字列の bigint も数に）', async () => {
  const usage = (v) => createAdminStore({ client: fakeClient({}, { rpcs: { admin_photo_usage: () => v } }) }).loadPhotoUsage();
  assert.deepEqual(await usage(123456), { ok: true, bytes: 123456 });
  assert.deepEqual(await usage('789'), { ok: true, bytes: 789 });
  assert.deepEqual(await usage(null), { ok: true, bytes: 0 });
});
