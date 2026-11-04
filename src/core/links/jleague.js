// Jリーグ公式のリンクを作る（設計書 6章、FR-15）。試合ページ・チケット・クラブのページ・トップ。

export const JLEAGUE_TOP = 'https://www.jleague.jp/';

/**
 * 試合ページのURLを正規化する。`/sp/match/...`（スマホ版）は `/sp/` を取り除き、末尾に `/` を付ける。
 * Jリーグ公式の試合ページ（`/match/...`）以外は null。
 * @param {unknown} url
 * @returns {string|null}
 */
export function normalizeJleagueMatchUrl(url) {
  if (typeof url !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.host !== 'www.jleague.jp') return null;
  const match = parsed.pathname.match(/^\/(?:sp\/)?(match\/[^/]+.*)$/);
  if (match === null) return null;
  const path = match[1].endsWith('/') ? match[1] : `${match[1]}/`;
  return `${JLEAGUE_TOP}${path}`;
}

/**
 * チケットのページのURL（試合ページの末尾に ticket/ を付ける）。試合ページがなければ null。
 * @param {string|null} matchUrl
 * @returns {string|null}
 */
export function jleagueTicketUrl(matchUrl) {
  const normalized = normalizeJleagueMatchUrl(matchUrl);
  return normalized === null ? null : `${normalized}ticket/`;
}

/**
 * 試合の詳細を開くリンク。試合ページがなければクラブのページ、それもなければトップ。
 * @param {{ matchUrl: string|null, clubUrl: string|null }} cond
 * @returns {string}
 */
export function jleagueMatchLink({ matchUrl, clubUrl }) {
  return matchUrl || clubUrl || JLEAGUE_TOP;
}
