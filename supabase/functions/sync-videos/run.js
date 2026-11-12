// 試合動画の登録の本体（設計書 6.3、D14・D18）。
// 通信・DB・現在時刻は引数で受け取る（Deno・fetch・Date.now() を使わない）。
import { planVideoUpserts, toVideos } from '../_shared/match-video.js';
import { jstToday, isClubId } from '../_shared/edge-auth.js';

const API = 'https://www.googleapis.com/youtube/v3';
const DAY_MS = 86400000;
const LOOKBACK_DAYS = 30;
// 一度だけのさかのぼり（since）で読む再生リストの最大ページ数（50本×10＝500本。YouTube は1ページ2単位）
export const MAX_BACKFILL_PAGES = 10;
// since に指定できるのは、今日から1年前まで
const MAX_SINCE_DAYS = 365;
const enc = encodeURIComponent;

// YouTube の URL（キーが入るので、ログ・message には出さない）
export const channelsUrl = (handle, key) => `${API}/channels?part=id,contentDetails&forHandle=${enc(handle)}&key=${enc(key)}`;
export const playlistItemsUrl = (playlistId, key, pageToken) => `${API}/playlistItems?part=snippet,contentDetails,status&maxResults=50&playlistId=${enc(playlistId)}&key=${enc(key)}${pageToken ? `&pageToken=${enc(pageToken)}` : ''}`;
export const videosUrl = (ids, key) => `${API}/videos?part=snippet,liveStreamingDetails,status&id=${enc(ids.join(','))}&key=${enc(key)}`;

// YouTube が 200 以外を返したときの文。本文の error.errors[0].reason（quotaExceeded など）だけを入れる。
// ほかの項目（message など）は URL・キーが入りうるので使わない。reason も英数字と _.- の64文字までだけ
export function youtubeErrorMessage(status, body) {
  const reason = body?.error?.errors?.[0]?.reason;
  const safe = typeof reason === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(reason) ? reason : null;
  return `YouTube API の応答が ${status}${safe ? `（${safe}）` : ''}`;
}

// 取得元を1つ処理して、{ read, saved, notApplied } を返す。例外は呼び出し側で記録する
// 再生リストの項目の公開日（日本時間の 'YYYY-MM-DD'）。読めなければ null
function publishedDate(item) {
  const ms = Date.parse(item?.contentDetails?.videoPublishedAt ?? item?.snippet?.publishedAt ?? '');
  return Number.isNaN(ms) ? null : jstToday(ms);
}

// since（'YYYY-MM-DD'）が使える値か：形が正しく、実在する日付で、今日から1年前〜今日
export function isValidSince(since, nowMs) {
  if (typeof since !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(since)) return false;
  const ms = Date.parse(`${since}T00:00:00Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== since) return false;
  return since <= jstToday(nowMs) && since >= jstToday(nowMs - MAX_SINCE_DAYS * DAY_MS);
}

async function syncSource({ db, getJson, nowMs, clubId, apiKey, since }, sources, index) {
  let source = sources[index];
  if (!source.uploads_playlist_id) {
    const res = await getJson(channelsUrl(source.channel, apiKey));
    const item = res?.items?.[0];
    const uploads = item?.contentDetails?.relatedPlaylists?.uploads;
    if (!item?.id || !uploads) throw new Error(`チャンネル ${source.channel} が見つかりません`);
    source = { ...source, channel_id: item.id, uploads_playlist_id: uploads };
    sources[index] = source;
    await db.saveVideoSources(clubId, sources);
  }
  // ふだんは新着1ページ（50本）だけ。since があれば、since より古い動画が出るページまで（最大 MAX_BACKFILL_PAGES）
  const maxPages = since ? MAX_BACKFILL_PAGES : 1;
  const videos = [];
  let pageToken;
  for (let page = 0; page < maxPages; page++) {
    const playlist = await getJson(playlistItemsUrl(source.uploads_playlist_id, apiKey, pageToken));
    const items = playlist?.items ?? [];
    const ids = items.map((i) => i?.contentDetails?.videoId ?? i?.snippet?.resourceId?.videoId).filter(Boolean);
    const details = ids.length > 0 ? (await getJson(videosUrl(ids, apiKey)))?.items ?? [] : [];
    videos.push(...toVideos(items, details, source.channel));
    pageToken = playlist?.nextPageToken;
    if (!pageToken || (since && items.some((i) => publishedDate(i) !== null && publishedDate(i) < since))) break;
  }

  const fixtures = await db.fixturesBetween(clubId, since ?? jstToday(nowMs - LOOKBACK_DAYS * DAY_MS), jstToday(nowMs));
  const rows = planVideoUpserts(videos, {
    fixtures,
    clubs: await db.clubs(),
    supportClubId: clubId,
    sources: [source],
    existing: fixtures.length > 0 ? await db.videosOf(fixtures.map((f) => f.id)) : [],
  });
  // upsertVideo：true＝書いた、false＝手入力なので書かなかった、null＝同じ値なので書かなかった（数えない）
  let saved = 0;
  let notApplied = 0;
  for (const row of rows) {
    const applied = await db.upsertVideo(row);
    if (applied === true) saved += 1;
    else if (applied === false) notApplied += 1;
  }
  return { read: videos.length, saved, notApplied };
}

async function sync(args, report) {
  const club = await args.db.club(args.clubId);
  if (!club) {
    report.error = `クラブ ${args.clubId} が見つかりません`;
    return;
  }
  const sources = (club.video_sources ?? []).map((s) => ({ ...s }));
  const targets = sources.map((s, i) => i).filter((i) => sources[i].channel);
  if (targets.length === 0) {
    report.message = '取得元がありません';
    return;
  }
  const parts = args.since ? [`${args.since} からさかのぼり`] : [];
  for (const i of targets) {
    const r = await syncSource(args, sources, i);
    parts.push(`${sources[i].channel}：動画 ${r.read} 本を調べ、${r.saved} 本を登録しました`);
    if (r.notApplied > 0) parts.push(`書き換えなかった動画（手入力）${r.notApplied} 本`);
  }
  report.message = parts.join('。');
}

// 戻り値：{ ok, message }。最後に必ず sync_runs を1行にする
// since：一度だけのさかのぼり（設計書 6.3）。渡さなければ、ふだんの毎日の取り込み
export async function runSyncVideos({ db, getJson, nowMs, clubId, apiKey, since }) {
  const report = { error: null, message: '' };
  if (!isClubId(clubId)) {
    report.error = 'club_id の形が正しくありません';
  } else if (since !== undefined && since !== null && !isValidSince(since, nowMs)) {
    report.error = 'さかのぼる日付（since）は、今日から1年前〜今日の YYYY-MM-DD で指定してください';
  } else if (!apiKey) {
    report.error = 'YouTube の APIキーが設定されていません';
  } else {
    try {
      await sync({ db, getJson, nowMs, clubId, apiKey, since: since ?? undefined }, report);
    } catch (e) {
      // 念のため、キーの値が文に入っていたら伏せる
      report.error = String(e?.message ?? e).split(apiKey).join('***');
    }
  }
  const result = report.error === null ? { ok: true, message: report.message } : { ok: false, message: report.error };
  await db.insertRun({ job: 'videos', ...result, list_read: 0, pages_read: 0 });
  return result;
}
