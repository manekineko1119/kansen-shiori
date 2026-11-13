// 試合ページの URL から事実を1回だけ読む本体（設計書 6.2）。
// 通信・DB・現在時刻は引数で受け取る（Deno・fetch・Date.now() を使わない）。
import { ACCESS_LIMITS } from '../_shared/sync-plan.js';
import { canonicalMatchPageUrl, parseMatchDetails } from '../_shared/jleague-parse.js';
import { jstDayStartIso } from '../_shared/edge-auth.js';

const MESSAGES = {
  url: 'Jリーグ公式の試合ページの URL（https://www.jleague.jp/match/…）を入れてください',
  limit: `今日の試合ページを読める数（${ACCESS_LIMITS.matchPagesPerDay}件）を使い切りました。明日もう一度読み込んでください`,
  parse: '試合ページの形が変わったため読み取れません',
};

const fail = (reason, message, detail) => ({ ok: false, reason, message, detail });

// 読んで解釈する。失敗は例外にせず結果で返す
async function readPage(fetchText, canonical) {
  let html;
  try {
    html = await fetchText(canonical);
  } catch (e) {
    const why = String(e?.message ?? e);
    return fail('fetch', `試合ページを読めませんでした：${why}`, why);
  }
  try {
    const page = parseMatchDetails(html);
    if (page.reason) return fail('parse', MESSAGES.parse, page.reason);
    return { ok: true, url: canonical, page };
  } catch (e) {
    return fail('parse', MESSAGES.parse, String(e?.message ?? e));
  }
}

// 戻り値：{ ok: true, url, page } か { ok: false, reason: 'url'|'limit'|'fetch'|'parse', message }
// 読む前に回数を予約し、予約できたら最後に必ず sync_runs を閉じる
export async function runImportMatch({ db, fetchText, nowMs, url }) {
  const canonical = canonicalMatchPageUrl(url);
  if (!canonical) return { ok: false, reason: 'url', message: MESSAGES.url };
  const runId = await db.reserveMatchPage({ dayStartIso: jstDayStartIso(nowMs), pagesLimit: ACCESS_LIMITS.matchPagesPerDay });
  if (runId === null || runId === undefined) return { ok: false, reason: 'limit', message: MESSAGES.limit };

  const path = new URL(canonical).pathname;
  let result = fail('parse', MESSAGES.parse, '不明なエラー');
  try {
    result = await readPage(fetchText, canonical);
  } finally {
    const message = result.ok ? `URL で読み込み：${path}` : `URL で読み込み失敗：${path}（${result.detail}）`;
    await db.finishRun(runId, { ok: result.ok, message, list_read: 0, pages_read: 1 });
  }
  const { detail, ...out } = result;
  return out;
}
