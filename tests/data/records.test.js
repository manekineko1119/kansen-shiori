import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecordStore } from '../../src/data/records.js';
import { createPhotoStore } from '../../src/data/photos.js';
import { fakeClient } from '../helpers/fake-supabase.js';

const ids = { homeClubId: 'nara', awayClubId: 'matsumoto' };
const edit = {
  fixture: { status: 'finished', home_score: 1, away_score: 3, scorers: [{ side: 'home', player: '田中', minute: '64', type: 'goal' }] },
  videos: { highlight: null, inside: 'https://youtu.be/x' },
};

test('save：検証で止めたら送らない。upsert は user_id・visibility・photo_path を送らない', async () => {
  const client = fakeClient({ match_records: [] });
  const store = createRecordStore({ client });
  const bad = await store.save({ fixture_id: 'f1', trip_id: null, watch_style: 'stadium', cost_goods: NaN });
  assert.equal(bad.errors.cost_goods, '費用は0以上の整数で入力してください');
  assert.equal(client.calls.length, 0);
  const res = await store.save({ fixture_id: 'f1', trip_id: 't1', watch_style: 'stadium', cost_transport: 1200, cost_food: undefined, memo: null });
  assert.equal(res.ok, true);
  const c = client.calls.at(-1);
  assert.deepEqual([c.table, c.op, c.onConflict], ['match_records', 'upsert', 'user_id,fixture_id']);
  assert.equal('user_id' in c.values, false);
  assert.equal('visibility' in c.values, false);
  assert.equal('photo_path' in c.values, false);
  assert.deepEqual([c.values.fixture_id, c.values.trip_id, c.values.cost_transport, c.values.cost_food, c.values.memo], ['f1', 't1', 1200, null, null]);
});

test('save：権限なしは { _form }、期限切れは expired、通信の失敗は理由つき', async () => {
  const rec = { fixture_id: 'f1', trip_id: null, watch_style: 'stadium' };
  const denied = createRecordStore({ client: fakeClient({}, { failOn: { match_records: { message: 'x', code: '42501' } } }) });
  assert.deepEqual(await denied.save(rec), { ok: false, errors: { _form: '権限がありません' } });
  const expired = createRecordStore({ client: fakeClient({}, { failOn: { match_records: { message: 'jwt', code: 'PGRST301' } } }) });
  assert.equal(await expired.save(rec), 'expired');
  const down = createRecordStore({ client: fakeClient({}, { throwOn: ['match_records'] }) });
  assert.equal((await down.save(rec)).ok, false);
});

test('remove：id で削除する', async () => {
  const client = fakeClient({ match_records: [{ id: 'r1' }, { id: 'r2' }] });
  const store = createRecordStore({ client });
  assert.deepEqual(await store.remove('r1'), { ok: true });
  const c = client.calls.at(-1);
  assert.deepEqual([c.op, c.eq], ['delete', [['id', 'r1']]]);
});

const NOW_MS = Date.UTC(2026, 10, 12, 15, 15); // 日本時間 11/13 0:15

test('saveFixtureInfo：fixtures は side を club_id にして manual と手で直した時刻を付ける。inside は upsert、highlight は manual の行だけ delete', async () => {
  const client = fakeClient({ fixtures: [{ id: 'f1' }], fixture_videos: [] });
  const store = createRecordStore({ client, now: () => NOW_MS });
  assert.deepEqual(await store.saveFixtureInfo('f1', edit, ids), { ok: true });
  const [fx, ...vids] = client.calls.filter((c) => c.op !== 'select');
  assert.deepEqual([fx.table, fx.op, fx.eq], ['fixtures', 'update', [['id', 'f1']]]);
  assert.deepEqual(fx.values, {
    status: 'finished', home_score: 1, away_score: 3,
    scorers: [{ club_id: 'nara', player: '田中', minute: '64', type: 'goal' }], result_source: 'manual',
    result_updated_at: '2026-11-12T15:15:00.000Z',
  });
  const up = vids.find((c) => c.op === 'upsert');
  assert.deepEqual([up.table, up.onConflict, up.values], ['fixture_videos', 'fixture_id,kind', { fixture_id: 'f1', kind: 'inside', url: 'https://youtu.be/x', source: 'manual' }]);
  const del = vids.find((c) => c.op === 'delete');
  assert.deepEqual([del.table, del.eq], ['fixture_videos', [['fixture_id', 'f1'], ['kind', 'highlight'], ['source', 'manual']]]);
});

test('saveFixtureInfo：away の得点者は away のクラブ。検証で止めたら送らない', async () => {
  const client = fakeClient({ fixtures: [{ id: 'f1' }] });
  const store = createRecordStore({ client });
  const away = { ...edit, fixture: { ...edit.fixture, scorers: [{ side: 'away', player: '山田', minute: '90+2', type: 'penalty' }] } };
  await store.saveFixtureInfo('f1', away, ids);
  assert.deepEqual(client.calls.find((c) => c.op === 'update').values.scorers, [{ club_id: 'matsumoto', player: '山田', minute: '90+2', type: 'penalty' }]);
  const calls = client.calls.length;
  const bad = await store.saveFixtureInfo('f1', { ...edit, videos: { highlight: 'https://evil.example/', inside: null } }, ids);
  assert.ok(bad.errors.video_highlight);
  assert.equal(client.calls.length, calls);
});

test('saveFixtureInfo：RLS で0行しか更新されなかったとき（管理者でない）は権限なし。動画は触らない', async () => {
  const client = fakeClient({ fixtures: [], fixture_videos: [] });
  const store = createRecordStore({ client });
  assert.deepEqual(await store.saveFixtureInfo('f1', edit, ids), { ok: false, errors: { _form: '権限がありません' } });
  assert.equal(client.calls.some((c) => c.table === 'fixture_videos'), false);
});

test('saveFixtureInfo：期限切れ・動画の失敗', async () => {
  const expired = createRecordStore({ client: fakeClient({ fixtures: [{ id: 'f1' }] }, { failOn: { fixtures: { code: 'PGRST303' } } }) });
  assert.equal(await expired.saveFixtureInfo('f1', edit, ids), 'expired');
  const PARTIAL = { ok: false, partial: true, errors: { _form: '試合の情報は保存しました。動画だけ保存できませんでした。もう一度保存してください' } };
  const vclient = fakeClient({ fixtures: [{ id: 'f1' }] }, { failOn: { fixture_videos: { code: '42501' } } });
  assert.deepEqual(await createRecordStore({ client: vclient }).saveFixtureInfo('f1', edit, ids), PARTIAL);
  assert.equal(vclient.calls.filter((c) => c.table === 'fixtures' && c.op === 'update').length, 1); // 試合の更新は入っている
  const down = fakeClient({ fixtures: [{ id: 'f1' }] }, { throwOn: ['fixture_videos'] });
  assert.deepEqual(await createRecordStore({ client: down }).saveFixtureInfo('f1', edit, ids), PARTIAL);
  const vexp = fakeClient({ fixtures: [{ id: 'f1' }] }, { failOn: { fixture_videos: { code: 'PGRST301' } } });
  assert.equal(await createRecordStore({ client: vexp }).saveFixtureInfo('f1', edit, ids), 'expired');
});

// ---- 写真（6-7。設計書 4.2.1・9章）
const rec = { fixture_id: 'f1', trip_id: null, watch_style: 'stadium' };
const BUCKET = 'record-photos';
const setup = (opts) => {
  const client = fakeClient({ match_records: [] }, opts);
  return { client, store: createRecordStore({ client, photos: createPhotoStore({ client, userId: 'u1' }) }) };
};
const saves = (client) => client.calls.filter((c) => c.table === 'match_records' && c.op === 'upsert');

test('save：photoPath を渡したときだけ photo_path を送る（null で外す）', async () => {
  const { client, store } = setup();
  await store.save(rec);
  assert.equal('photo_path' in saves(client)[0].values, false);
  await store.save(rec, { photoPath: 'u1/f1.jpg' });
  assert.equal(saves(client)[1].values.photo_path, 'u1/f1.jpg');
  await store.save(rec, { photoPath: null });
  assert.equal(saves(client)[2].values.photo_path, null);
});

test('saveWithPhoto：記録を保存 → アップロード → photo_path を入れてもう一度保存。user_id は送らない', async () => {
  const { client, store } = setup();
  const res = await store.saveWithPhoto(rec, async () => 'BLOB');
  assert.deepEqual(res, { ok: true, id: undefined });
  assert.deepEqual(client.calls.map((c) => c.op), ['upsert', 'upload', 'upsert']);
  assert.equal(client.storage.objects[BUCKET]['u1/f1.jpg'], 'BLOB');
  const [first, second] = saves(client);
  assert.equal('photo_path' in first.values, false);
  assert.equal(second.values.photo_path, 'u1/f1.jpg');
  assert.equal('user_id' in second.values, false);
});

test('saveWithPhoto：写真を選んでいなければ保存だけ', async () => {
  const { client, store } = setup();
  assert.equal((await store.saveWithPhoto(rec, null)).ok, true);
  assert.deepEqual(client.calls.map((c) => c.op), ['upsert']);
});

test('saveWithPhoto：検証・記録の保存の失敗では写真に進まない', async () => {
  const bad = setup();
  assert.equal((await bad.store.saveWithPhoto({ ...rec, watch_style: 'x' }, async () => 'B')).ok, false);
  assert.equal(bad.client.calls.length, 0);
  const down = setup({ failOn: { match_records: { message: 'x', code: '42501' } } });
  assert.deepEqual(await down.store.saveWithPhoto(rec, async () => 'B'), { ok: false, errors: { _form: '権限がありません' } });
  assert.equal(down.client.calls.some((c) => c.op === 'upload'), false);
});

test('saveWithPhoto：写真だけ失敗しても記録は保存したまま。photoError を返す（アップロード・縮小のどちらも）', async () => {
  const up = setup({ failOn: { [BUCKET]: { message: 'x' } } });
  assert.deepEqual(await up.store.saveWithPhoto(rec, async () => 'B'), { ok: true, id: undefined, photoError: '写真をアップロードできませんでした' });
  assert.equal(up.client.calls.filter((c) => c.op === 'upsert').length, 1);
  const shrink = setup();
  const r = await shrink.store.saveWithPhoto(rec, async () => { throw new Error('big'); });
  assert.equal(r.ok, true);
  assert.equal(r.photoError, '写真を縮小できませんでした');
  assert.equal(shrink.client.calls.some((c) => c.op === 'upload'), false);
});

test('saveWithPhoto：写真の期限切れは expired。photo_path の保存の失敗は写真の失敗として返す', async () => {
  const exp = setup({ failOn: { [BUCKET]: { message: 'jwt', status: 401 } } });
  assert.equal(await exp.store.saveWithPhoto(rec, async () => 'B'), 'expired');
  let n = 0;
  const { client, store } = setup();
  const orig = client.from.bind(client);
  client.from = (t) => { const q = orig(t); if (t === 'match_records' && ++n === 2) q.upsert = () => { throw new TypeError('Failed to fetch'); }; return q; };
  const r = await store.saveWithPhoto(rec, async () => 'B');
  assert.equal(r.ok, true);
  assert.equal(r.photoError, '写真をアップロードできませんでした');
});

test('attachPhoto：写真だけやり直す（アップロード → photo_path の保存）。失敗は { ok: false, errors: { photo } }', async () => {
  const { client, store } = setup();
  assert.equal((await store.attachPhoto(rec, async () => 'B')).ok, true);
  assert.deepEqual(client.calls.map((c) => c.op), ['upload', 'upsert']);
  const bad = setup({ failOn: { [BUCKET]: { message: 'x' } } });
  assert.deepEqual(await bad.store.attachPhoto(rec, async () => 'B'), { ok: false, errors: { photo: '写真をアップロードできませんでした' } });
});

test('removePhoto：photo_path を外してから写真を消す。写真の削除に失敗しても成功', async () => {
  const { client, store } = setup();
  await store.attachPhoto(rec, async () => 'B');
  assert.deepEqual(await store.removePhoto({ ...rec, photo_path: 'u1/f1.jpg' }), { ok: true });
  assert.equal(saves(client).at(-1).values.photo_path, null);
  assert.deepEqual(client.storage.objects[BUCKET], {});
  const fail = setup({ failOn: { [BUCKET]: { message: 'x' } } });
  assert.deepEqual(await fail.store.removePhoto({ ...rec, photo_path: 'u1/f1.jpg' }), { ok: true });
});

test('remove：記録を消したら写真も消す。写真の削除の失敗では止めない。記録の削除の失敗では写真を消さない', async () => {
  const { client, store } = setup();
  await store.attachPhoto(rec, async () => 'B');
  assert.deepEqual(await store.remove('r1', 'u1/f1.jpg'), { ok: true });
  assert.deepEqual(client.storage.objects[BUCKET], {});
  const fail = setup({ failOn: { [BUCKET]: { message: 'x' } } });
  assert.deepEqual(await fail.store.remove('r1', 'u1/f1.jpg'), { ok: true });
  const keep = setup({ failOn: { match_records: { message: 'x', code: '42501' } } });
  await keep.client.storage.from(BUCKET).upload('u1/f1.jpg', 'B', {});
  assert.equal((await keep.store.remove('r1', 'u1/f1.jpg')).ok, false);
  assert.equal(keep.client.storage.objects[BUCKET]['u1/f1.jpg'], 'B');
  const none = setup();
  await none.store.remove('r1', null);
  assert.equal(none.client.calls.some((c) => c.op === 'remove'), false);
});

test('saveFixtureInfo：今と同じ URL の動画は書き込まない（自動の動画を手入力に変えない）。違う URL だけ upsert', async () => {
  const client = fakeClient({ fixtures: [{ id: 'f1' }], fixture_videos: [] });
  const store = createRecordStore({ client, now: () => NOW_MS });
  const same = { ...edit, videos: { highlight: 'https://www.youtube.com/watch?v=H', inside: 'https://youtu.be/new' } };
  const currentVideos = [
    { kind: 'highlight', url: 'https://www.youtube.com/watch?v=H', source: 'api' },
    { kind: 'inside', url: 'https://www.youtube.com/watch?v=I', source: 'api' },
  ];
  assert.deepEqual(await store.saveFixtureInfo('f1', same, { ...ids, currentVideos }), { ok: true });
  const vids = client.calls.filter((c) => c.table === 'fixture_videos');
  assert.deepEqual(vids.map((c) => [c.op, c.values?.kind]), [['upsert', 'inside']]);
});
