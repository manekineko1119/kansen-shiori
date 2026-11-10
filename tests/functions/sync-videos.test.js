import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSyncVideos, channelsUrl, playlistItemsUrl, videosUrl } from '../../supabase/functions/sync-videos/run.js';

const KEY = 'AIzaFAKE-key-0000';
const NOW = Date.UTC(2026, 10, 9, 22, 0); // 日本時間 2026-11-10 7:00
const HL = '２０２６／２７明治安田Ｊ３リーグ 第13節 2026.10.25 松本 vs 山口';
const IN = '【INSIDE】 #13 vs RENOFA YAMAGUCHI FC';
const GOALS = 'ゴール集 2026';
const kinds = { highlight: ['明治安田'], inside: ['【INSIDE】'] };
const clubs = [
  { id: 'matsumoto', name: '松本山雅FC', short_name: '松本', aliases: [] },
  { id: 'yamaguchi', name: 'レノファ山口FC', short_name: '山口', aliases: ['RENOFA YAMAGUCHI FC'] },
];
const fixtures = [{ id: 'f13', match_date: '2026-10-25', round: '13', home_club_id: 'matsumoto', away_club_id: 'yamaguchi' }];

const plItem = (id) => ({ contentDetails: { videoId: id, videoPublishedAt: '2026-10-25T10:00:00Z' }, snippet: { title: id } });
const detail = (id, title, publishedAt) => ({
  id, snippet: { title, publishedAt, liveBroadcastContent: 'none' }, status: { privacyStatus: 'public' },
});
const VIDEOS = {
  items: [
    detail('v1', HL, '2026-10-25T12:00:00Z'),
    detail('v2', IN, '2026-10-27T10:00:00Z'),
    detail('v3', GOALS, '2026-10-28T10:00:00Z'),
  ],
};
const PLAYLIST = { items: [plItem('v1'), plItem('v2'), plItem('v3')] };
const CHANNELS = { items: [{ id: 'UCabc', contentDetails: { relatedPlaylists: { uploads: 'UUabc' } } }] };

function makeDb(sources, over = {}) {
  const calls = { saveVideoSources: [], upsertVideo: [], insertRun: [], videosOf: [], fixturesBetween: [] };
  const db = {
    club: async (id) => ({ id, video_sources: sources }),
    saveVideoSources: async (id, s) => { calls.saveVideoSources.push([id, s]); },
    fixturesBetween: async (...a) => { calls.fixturesBetween.push(a); return fixtures; },
    clubs: async () => clubs,
    videosOf: async (ids) => { calls.videosOf.push(ids); return []; },
    upsertVideo: async (row) => { calls.upsertVideo.push(row); return true; },
    insertRun: async (row) => { calls.insertRun.push(row); },
    ...over,
  };
  return { db, calls };
}

function makeGetJson() {
  const urls = [];
  const getJson = async (url) => {
    urls.push(url);
    if (url.includes('/channels?')) return CHANNELS;
    if (url.includes('/playlistItems?')) return PLAYLIST;
    return VIDEOS;
  };
  return { urls, getJson };
}

const run = (db, getJson, extra = {}) => runSyncVideos({ db, getJson, nowMs: NOW, clubId: 'matsumoto', apiKey: KEY, ...extra });

test('URL：ハンドル・再生リスト・動画 ID をエンコードしてキーを付ける', () => {
  assert.equal(channelsUrl('@yamagachannel', 'K'), 'https://www.googleapis.com/youtube/v3/channels?part=id,contentDetails&forHandle=%40yamagachannel&key=K');
  assert.equal(playlistItemsUrl('UUabc', 'K'), 'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails,status&maxResults=50&playlistId=UUabc&key=K');
  assert.equal(videosUrl(['a', 'b'], 'K'), 'https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails,status&id=a%2Cb&key=K');
});

test('uploads_playlist_id がないとき：channels を1回呼び、取得元に ID を書き足して保存する', async () => {
  const { db, calls } = makeDb([{ channel: '@yamagachannel', kinds }]);
  const io = makeGetJson();
  await run(db, io.getJson);
  assert.equal(io.urls.filter((u) => u.includes('/channels?')).length, 1);
  assert.equal(io.urls.length, 3); // channels・playlistItems・videos を1回ずつ
  assert.deepEqual(calls.saveVideoSources, [['matsumoto', [{ channel: '@yamagachannel', kinds, channel_id: 'UCabc', uploads_playlist_id: 'UUabc' }]]]);
});

test('uploads_playlist_id があるとき：channels を呼ばず、保存もしない', async () => {
  const { db, calls } = makeDb([{ channel: '@yamagachannel', kinds, channel_id: 'UCabc', uploads_playlist_id: 'UUabc' }]);
  const io = makeGetJson();
  const r = await run(db, io.getJson);
  assert.equal(io.urls.some((u) => u.includes('/channels?')), false);
  assert.equal(io.urls.length, 2);
  assert.deepEqual(calls.saveVideoSources, []);
  assert.equal(r.ok, true);
});

test('ハイライト1本・INSIDE 1本・ゴール集1本：登録は2回。試合の範囲は今日から30日前〜今日', async () => {
  const { db, calls } = makeDb([{ channel: '@yamagachannel', kinds, uploads_playlist_id: 'UUabc' }]);
  const r = await run(db, makeGetJson().getJson);
  assert.deepEqual(calls.upsertVideo.map((x) => [x.fixture_id, x.kind, x.channel]).sort(), [
    ['f13', 'highlight', '@yamagachannel'],
    ['f13', 'inside', '@yamagachannel'],
  ]);
  assert.deepEqual(calls.fixturesBetween, [['matsumoto', '2026-10-11', '2026-11-10']]);
  assert.deepEqual(calls.videosOf, [['f13']]);
  assert.deepEqual(calls.insertRun, [{ job: 'videos', ok: true, message: r.message, list_read: 0, pages_read: 0 }]);
  assert.match(r.message, /2 本を登録/);
});

test('手入力の INSIDE は上書きしない（upsertVideo を呼ばない）', async () => {
  const { db, calls } = makeDb([{ channel: '@yamagachannel', kinds, uploads_playlist_id: 'UUabc' }], {
    videosOf: async () => [{ fixture_id: 'f13', kind: 'inside', source: 'manual' }],
  });
  await run(db, makeGetJson().getJson);
  assert.deepEqual(calls.upsertVideo.map((x) => x.kind), ['highlight']);
});

test('YouTube が 403：ok: false で記録し、message に 403 があり、APIキーの値は入らない', async () => {
  const { db, calls } = makeDb([{ channel: '@yamagachannel', kinds, uploads_playlist_id: 'UUabc' }]);
  const r = await run(db, async () => { throw new Error('YouTube API の応答が 403'); });
  assert.equal(r.ok, false);
  assert.equal(calls.insertRun.length, 1);
  assert.equal(calls.insertRun[0].job, 'videos');
  assert.equal(calls.insertRun[0].ok, false);
  assert.match(calls.insertRun[0].message, /403/);
  assert.equal(calls.insertRun[0].message.includes(KEY), false);
});

test('例外の文に APIキーが入っていたら *** に置き換える', async () => {
  const { db, calls } = makeDb([{ channel: '@yamagachannel', kinds, uploads_playlist_id: 'UUabc' }]);
  await run(db, async (url) => { throw new Error(`failed ${url}`); });
  assert.equal(calls.insertRun[0].message.includes(KEY), false);
  assert.match(calls.insertRun[0].message, /key=\*\*\*/);
});

test('upsertVideo が false：message に「書き換えなかった動画（手入力）」', async () => {
  const { db, calls } = makeDb([{ channel: '@yamagachannel', kinds, uploads_playlist_id: 'UUabc' }], { upsertVideo: async () => false });
  const r = await run(db, makeGetJson().getJson);
  assert.match(r.message, /書き換えなかった動画（手入力）2 本/);
  assert.equal(r.ok, true);
  assert.equal(calls.insertRun.length, 1);
});

test('APIキーが空：YouTube を呼ばず ok: false で記録する', async () => {
  const { db, calls } = makeDb([{ channel: '@yamagachannel', kinds }]);
  const io = makeGetJson();
  const r = await run(db, io.getJson, { apiKey: '' });
  assert.equal(r.ok, false);
  assert.equal(io.urls.length, 0);
  assert.equal(calls.insertRun[0].message, 'YouTube の APIキーが設定されていません');
});

test('取得元がない・channel がない：YouTube を呼ばず ok: true で記録する', async () => {
  for (const sources of [[], null, [{ kinds }]]) {
    const { db, calls } = makeDb(sources);
    const io = makeGetJson();
    const r = await run(db, io.getJson);
    assert.deepEqual([r.ok, r.message, io.urls.length], [true, '取得元がありません', 0]);
    assert.equal(calls.insertRun.length, 1);
  }
});

test('取得元が複数：順に処理し、記録は1回', async () => {
  const { db, calls } = makeDb([
    { channel: '@yamagachannel', kinds, uploads_playlist_id: 'UUabc' },
    { channel: '@other', kinds: {}, uploads_playlist_id: 'UUother' },
  ]);
  const io = makeGetJson();
  await run(db, io.getJson);
  assert.equal(io.urls.length, 4);
  assert.equal(calls.insertRun.length, 1);
});
