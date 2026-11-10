// 試合動画の判定（設計書 5.8）。Edge Function sync-videos と Node のテストの両方から読む純粋な関数。
// 通信・現在時刻の取得はしない。日付の足し引きは Date.UTC だけで行う。
import { toHalfWidth, normalizeName } from './text.js';

const HIGHLIGHT_WINDOW_DAYS = 3;
const INSIDE_WINDOW_DAYS = 14;
const DAY_MS = 86400000;
const JST_OFFSET_MS = 9 * 3600000;

// タイトルの種類。キーワードは normalizeName で比べる（全角・大文字小文字・空白を無視）
export function classifyVideo(title, source) {
  const t = normalizeName(title);
  const hit = (words) => (words ?? []).some((w) => normalizeName(w) !== '' && t.includes(normalizeName(w)));
  if (hit(source?.kinds?.highlight)) return 'highlight';
  if (hit(source?.kinds?.inside)) return 'inside';
  return null;
}

// ハイライトのタイトルの試合日（2026.10.25 → '2026-10-25'）。読めない・存在しない日付は null
export function parseHighlightDate(title) {
  const m = toHalfWidth(title).match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${m[1]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// INSIDE のタイトルの節（#13 → '13'）
export function parseInsideRound(title) {
  const m = toHalfWidth(title).match(/#(\d+)/);
  return m ? m[1] : null;
}

const dayNumber = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};

// ISO（UTC）の公開日時 → 日本の日付の通し番号。読めなければ null
function publishedDay(publishedAt) {
  const ms = Date.parse(publishedAt);
  return Number.isNaN(ms) ? null : Math.floor((ms + JST_OFFSET_MS) / DAY_MS);
}

function opponentNames(club) {
  return [club?.name, club?.short_name, ...(club?.aliases ?? [])]
    .map((n) => normalizeName(n))
    .filter((n) => n !== '');
}

// 応援クラブの試合のうち、相手の名前がタイトルに入っているもの
function supportFixtures(title, { fixtures, clubs, supportClubId }) {
  const t = normalizeName(title);
  const byId = new Map(clubs.map((c) => [c.id, c]));
  return fixtures.filter((f) => {
    if (f.home_club_id !== supportClubId && f.away_club_id !== supportClubId) return false;
    const oppId = f.home_club_id === supportClubId ? f.away_club_id : f.home_club_id;
    return opponentNames(byId.get(oppId)).some((n) => t.includes(n));
  });
}

// 候補がちょうど1試合のときだけ fixture ID を返す
export function matchVideo({ title, publishedAt, kind }, ctx) {
  const cands = supportFixtures(title, ctx);
  let hit = [];
  if (kind === 'highlight') {
    const date = parseHighlightDate(title);
    if (date) {
      hit = cands.filter((f) => f.match_date === date);
    } else {
      hit = inWindow(cands, publishedAt, HIGHLIGHT_WINDOW_DAYS);
    }
  } else if (kind === 'inside') {
    hit = inWindow(cands, publishedAt, INSIDE_WINDOW_DAYS);
    if (hit.length > 1) {
      const round = parseInsideRound(title);
      hit = round === null ? [] : hit.filter((f) => String(f.round) === round);
    }
  }
  return hit.length === 1 ? hit[0].id : null;
}

// 試合日が公開日（日本の日付）の 0〜maxDays 日前の試合
function inWindow(fixtures, publishedAt, maxDays) {
  const pub = publishedDay(publishedAt);
  if (pub === null) return [];
  return fixtures.filter((f) => {
    const diff = pub - dayNumber(f.match_date);
    return diff >= 0 && diff <= maxDays;
  });
}

// 動画（{ url, title, publishedAt, channel, isUpcoming? }）から fixture_videos に入れる行を作る
export function planVideoUpserts(videos, { fixtures, clubs, supportClubId, sources, existing }) {
  const manual = new Set(
    (existing ?? []).filter((e) => e.source === 'manual').map((e) => `${e.fixture_id}|${e.kind}`),
  );
  const rows = new Map(); // 同じ試合・種類は公開が新しい1本だけ
  for (const v of videos) {
    if (v.isUpcoming) continue;
    const source = (sources ?? []).find((s) => s.channel === v.channel);
    if (!source) continue;
    const kind = classifyVideo(v.title, source);
    if (!kind) continue;
    const fixtureId = matchVideo({ title: v.title, publishedAt: v.publishedAt, kind }, { fixtures, clubs, supportClubId });
    if (!fixtureId) continue;
    const key = `${fixtureId}|${kind}`;
    if (manual.has(key)) continue;
    const prev = rows.get(key);
    if (prev && Date.parse(prev.published_at) >= Date.parse(v.publishedAt)) continue;
    rows.set(key, {
      fixture_id: fixtureId, kind, url: v.url, title: v.title, channel: v.channel, published_at: v.publishedAt,
    });
  }
  return [...rows.values()];
}

// まだ公開されていない動画か（設計書 6.3 の暫定の見分け方）。
// ①videos.list に返ってこない ②liveBroadcastContent が none でない ③privacyStatus が public でない ④liveStreamingDetails があるのに actualEndTime がない
function isNotPublished(detail) {
  if (!detail) return true;
  if (detail.snippet?.liveBroadcastContent !== 'none') return true;
  if (detail.status?.privacyStatus !== 'public') return true;
  if (detail.liveStreamingDetails && !detail.liveStreamingDetails.actualEndTime) return true;
  return false;
}

// playlistItems.list の items と videos.list の items から、planVideoUpserts に渡す動画の配列を作る
export function toVideos(playlistItems, videoDetails, channelHandle) {
  const details = new Map((videoDetails ?? []).map((d) => [d.id, d]));
  const videos = [];
  for (const item of playlistItems ?? []) {
    const id = item?.contentDetails?.videoId ?? item?.snippet?.resourceId?.videoId;
    if (!id) continue;
    const detail = details.get(id);
    videos.push({
      url: `https://www.youtube.com/watch?v=${id}`,
      title: detail?.snippet?.title ?? item.snippet?.title ?? '',
      publishedAt: detail?.snippet?.publishedAt ?? item.contentDetails?.videoPublishedAt ?? null,
      channel: channelHandle,
      isUpcoming: isNotPublished(detail),
    });
  }
  return videos;
}
