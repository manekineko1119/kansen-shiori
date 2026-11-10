import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyVideo, parseHighlightDate, parseInsideRound, matchVideo, planVideoUpserts, toVideos,
} from '../../supabase/functions/_shared/match-video.js';

const src = { channel: '@yamagachannel', kinds: { highlight: ['明治安田'], inside: ['【INSIDE】'] } };
const clubs = [
  { id: 'matsumoto', name: '松本山雅FC', short_name: '松本', aliases: [] },
  { id: 'yamaguchi', name: 'レノファ山口FC', short_name: '山口', aliases: ['RENOFA YAMAGUCHI FC'] },
];
const fixtures = [{ id: 'f13', match_date: '2026-10-25', round: '13', home_club_id: 'matsumoto', away_club_id: 'yamaguchi', competition: 'J3' }];
const ctx = { fixtures, clubs, supportClubId: 'matsumoto' };
const HL = '２０２６／２７明治安田Ｊ３リーグ 第13節 2026.10.25 松本 vs 山口';
const IN = '【INSIDE】 #13 vs RENOFA YAMAGUCHI FC';

test('種類の判定：ハイライト・INSIDE・無視', () => {
  assert.equal(classifyVideo(HL, src), 'highlight');
  assert.equal(classifyVideo('【inside】 #13 vs RENOFA YAMAGUCHI FC', src), 'inside');
  assert.equal(classifyVideo('ゴール集 2026', src), null);
});

test('タイトルの日付と節を読む', () => {
  assert.equal(parseHighlightDate(HL), '2026-10-25');
  assert.equal(parseHighlightDate('2026.1.5 松本 vs 山口'), '2026-01-05');
  assert.equal(parseHighlightDate('ゴール集'), null);
  assert.equal(parseInsideRound(IN), '13');
  assert.equal(parseInsideRound('【INSIDE】 Levain cup vs SANFRECCE HIROSHIMA'), null);
});

test('ハイライト：節の数字が違っても日付で決める', () => {
  const t = '２０２６／２７明治安田Ｊ３リーグ 第11節 2026.10.25 松本 vs 山口';
  assert.equal(matchVideo({ title: t, publishedAt: '2026-10-26T09:00:00Z', kind: 'highlight' }, ctx), 'f13');
});

test('ハイライト：日付があっても相手の名前がなければ null', () => {
  assert.equal(matchVideo({ title: '明治安田 2026.10.25 松本 vs 長野', publishedAt: '2026-10-26T09:00:00Z', kind: 'highlight' }, ctx), null);
});

test('ハイライト：日付が読めないときは公開日から3日以内＋相手の名前', () => {
  const t = '明治安田Ｊ３ 松本 vs 山口';
  assert.equal(matchVideo({ title: t, publishedAt: '2026-10-28T14:59:00Z', kind: 'highlight' }, ctx), 'f13'); // 日本では10-28＝3日後
  assert.equal(matchVideo({ title: t, publishedAt: '2026-10-28T15:00:00Z', kind: 'highlight' }, ctx), null); // 日本では10-29＝4日後
  assert.equal(matchVideo({ title: t, publishedAt: '2026-10-24T09:00:00Z', kind: 'highlight' }, ctx), null); // 試合より前
});

test('ハイライト：候補が0件・2件以上なら null', () => {
  const two = [...fixtures, { id: 'f14', match_date: '2026-10-26', round: '14', home_club_id: 'yamaguchi', away_club_id: 'matsumoto', competition: 'J3' }];
  const t = '明治安田Ｊ３ 松本 vs 山口';
  assert.equal(matchVideo({ title: t, publishedAt: '2026-10-27T09:00:00Z', kind: 'highlight' }, { ...ctx, fixtures: two }), null);
  assert.equal(matchVideo({ title: t, publishedAt: '2026-10-27T09:00:00Z', kind: 'highlight' }, { ...ctx, fixtures: [] }), null);
});

test('応援クラブが出ない試合は候補にしない', () => {
  const other = [{ id: 'x', match_date: '2026-10-25', round: '13', home_club_id: 'yamaguchi', away_club_id: 'matsumoto', competition: 'J3' }];
  assert.equal(matchVideo({ title: HL, publishedAt: '2026-10-26T09:00:00Z', kind: 'highlight' }, { ...ctx, supportClubId: 'yamaguchi', fixtures: [{ ...other[0], home_club_id: 'a', away_club_id: 'b' }] }), null);
});

test('INSIDE：14日以内なら照合し、超えたら null', () => {
  assert.equal(matchVideo({ title: IN, publishedAt: '2026-10-28T09:00:00Z', kind: 'inside' }, ctx), 'f13');
  assert.equal(matchVideo({ title: IN, publishedAt: '2026-11-08T09:00:00Z', kind: 'inside' }, ctx), 'f13'); // 14日後
  assert.equal(matchVideo({ title: IN, publishedAt: '2026-11-09T09:00:00Z', kind: 'inside' }, ctx), null); // 15日後
});

test('INSIDE：同じ相手が期間内に2試合なら #数字で絞る', () => {
  const two = [
    { id: 'f13', match_date: '2026-10-25', round: '13', home_club_id: 'matsumoto', away_club_id: 'yamaguchi', competition: 'J3' },
    { id: 'cup', match_date: '2026-10-29', round: null, home_club_id: 'yamaguchi', away_club_id: 'matsumoto', competition: 'Cup' },
  ];
  const c = { ...ctx, fixtures: two };
  assert.equal(matchVideo({ title: IN, publishedAt: '2026-10-31T09:00:00Z', kind: 'inside' }, c), 'f13');
  assert.equal(matchVideo({ title: '【INSIDE】 #99 vs RENOFA YAMAGUCHI FC', publishedAt: '2026-10-31T09:00:00Z', kind: 'inside' }, c), null);
  assert.equal(matchVideo({ title: '【INSIDE】 vs RENOFA YAMAGUCHI FC', publishedAt: '2026-10-31T09:00:00Z', kind: 'inside' }, c), null);
});

test('planVideoUpserts：行の形、無関係な動画・予約中・手入力ありを除く', () => {
  const videos = [
    { url: 'https://youtu.be/a', title: HL, publishedAt: '2026-10-26T09:00:00Z', channel: '@yamagachannel' },
    { url: 'https://youtu.be/b', title: IN, publishedAt: '2026-10-28T09:00:00Z', channel: '@yamagachannel' },
    { url: 'https://youtu.be/c', title: 'ゴール集 2026', publishedAt: '2026-10-28T09:00:00Z', channel: '@yamagachannel' },
    { url: 'https://youtu.be/d', title: HL, publishedAt: '2026-10-26T09:00:00Z', channel: '@other' },
  ];
  const base = { ...ctx, sources: [src] };
  assert.deepEqual(planVideoUpserts(videos, { ...base, existing: [] }), [
    { fixture_id: 'f13', kind: 'highlight', url: 'https://youtu.be/a', title: HL, channel: '@yamagachannel', published_at: '2026-10-26T09:00:00Z' },
    { fixture_id: 'f13', kind: 'inside', url: 'https://youtu.be/b', title: IN, channel: '@yamagachannel', published_at: '2026-10-28T09:00:00Z' },
  ]);
  const manual = planVideoUpserts(videos, { ...base, existing: [{ fixture_id: 'f13', kind: 'inside', source: 'manual' }] });
  assert.deepEqual(manual.map((r) => r.kind), ['highlight']);
  const api = planVideoUpserts(videos, { ...base, existing: [{ fixture_id: 'f13', kind: 'inside', source: 'api' }] });
  assert.equal(api.length, 2);
  const upcoming = planVideoUpserts([{ ...videos[0], isUpcoming: true }, videos[1]], { ...base, existing: [] });
  assert.deepEqual(upcoming.map((r) => r.kind), ['inside']);
});

test('planVideoUpserts：同じ試合・種類が複数なら公開が新しい1本だけ', () => {
  const v = [
    { url: 'u1', title: HL, publishedAt: '2026-10-26T09:00:00Z', channel: '@yamagachannel' },
    { url: 'u2', title: HL, publishedAt: '2026-10-27T09:00:00Z', channel: '@yamagachannel' },
  ];
  const r = planVideoUpserts(v, { ...ctx, sources: [src], existing: [] });
  assert.deepEqual(r.map((x) => x.url), ['u2']);
});

test('classifyVideo：ハイライトと INSIDE の両方のキーワードを含むタイトルは highlight（現状の挙動）', () => {
  assert.equal(classifyVideo('明治安田 【INSIDE】 #13', src), 'highlight');
});

// toVideos：4-6 で見た形をまねた架空のデータ
const plItem = (id) => ({ contentDetails: { videoId: id, videoPublishedAt: '2026-10-25T10:00:00Z' }, snippet: { title: `list-${id}` } });
const vd = (id, over = {}) => ({
  id, snippet: { title: `title-${id}`, publishedAt: '2026-10-25T12:00:00Z', liveBroadcastContent: 'none' }, status: { privacyStatus: 'public' }, ...over,
});

test('toVideos：公開済み・ふつうの動画は isUpcoming: false。channel は引数のハンドル', () => {
  const [v] = toVideos([plItem('a')], [vd('a')], '@yamagachannel');
  assert.deepEqual(v, {
    url: 'https://www.youtube.com/watch?v=a', title: 'title-a', publishedAt: '2026-10-25T12:00:00Z', channel: '@yamagachannel', isUpcoming: false,
  });
});

test('toVideos：公開済みのプレミア（開始・終了あり）は isUpcoming: false', () => {
  const live = { scheduledStartTime: '2026-10-27T10:00:00Z', actualStartTime: '2026-10-27T10:00:00Z', actualEndTime: '2026-10-27T10:30:00Z' };
  assert.equal(toVideos([plItem('a')], [vd('a', { liveStreamingDetails: live })], '@c')[0].isUpcoming, false);
});

test('toVideos：予約中（upcoming・actualStartTime なし）は isUpcoming: true', () => {
  const d = vd('a', { snippet: { title: 't', publishedAt: '2026-11-20T10:00:00Z', liveBroadcastContent: 'upcoming' }, liveStreamingDetails: { scheduledStartTime: '2026-11-20T10:00:00Z' } });
  assert.equal(toVideos([plItem('a')], [d], '@c')[0].isUpcoming, true);
});

test('toVideos：live・非公開・終了時刻のない配信情報は isUpcoming: true', () => {
  const live = vd('a', { snippet: { title: 't', publishedAt: 'x', liveBroadcastContent: 'live' } });
  const priv = vd('b', { status: { privacyStatus: 'unlisted' } });
  const noEnd = vd('c', { liveStreamingDetails: { scheduledStartTime: 's', actualStartTime: 's' } });
  const r = toVideos([plItem('a'), plItem('b'), plItem('c')], [live, priv, noEnd], '@c');
  assert.deepEqual(r.map((v) => v.isUpcoming), [true, true, true]);
});

test('toVideos：videos.list に返ってこない動画は isUpcoming: true、タイトルと公開日時は playlistItems から', () => {
  const [v] = toVideos([plItem('gone')], [], '@c');
  assert.equal(v.isUpcoming, true);
  assert.equal(v.title, 'list-gone');
  assert.equal(v.publishedAt, '2026-10-25T10:00:00Z');
});
