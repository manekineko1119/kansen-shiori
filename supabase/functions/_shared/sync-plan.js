// 試合結果の取り込みの計画（設計書 6.2）。純粋な関数。通信・時刻は持ち込まない
import { matchFixture } from './jleague-parse.js';

// アクセスの約束（設計書 6.2）
export const ACCESS_LIMITS = { listPerRun: 1, matchPagesPerRun: 5, listPerDay: 2, matchPagesPerDay: 10, intervalMs: 2000 };

// sync_runs の今日の分から、残りの回数を出す（試合結果の取り込み＝job が results の行だけ）
export function remainingQuota(runsToday) {
  const rows = runsToday.filter((r) => r.job === 'results');
  const sum = (key) => rows.reduce((n, r) => n + (r[key] ?? 0), 0);
  return {
    list: Math.max(0, ACCESS_LIMITS.listPerDay - sum('list_read')),
    matchPages: Math.max(0, ACCESS_LIMITS.matchPagesPerDay - sum('pages_read')),
  };
}

// 両チームのスコアが整数のときだけ [ホーム, アウェイ]、そうでなければ null
function scoresOf(item) {
  const home = item.home?.score;
  const away = item.away?.score;
  return Number.isInteger(home) && Number.isInteger(away) ? [home, away] : null;
}

function resultPatch(item, fixture) {
  const scores = scoresOf(item);
  if (!scores) return {};
  const [home, away] = scores;
  const want = { status: 'finished', home_score: home, away_score: away, result_source: 'api' };
  return Object.fromEntries(Object.entries(want).filter(([k, v]) => fixture[k] !== v));
}

// 戻り値：updates（書き換える列だけの patch）、matchPagesToRead、unmatched、duplicates（同じ試合に当たった2つ目以降の item）、unknownStates
// scorers_failed_at が入っている試合（得点者の取り込みに失敗した試合）は試合ページを読まない。結果の更新は許す
export function planSync({ items, fixtures, clubs, quota }) {
  const plan = { updates: [], matchPagesToRead: [], unmatched: [], duplicates: [], unknownStates: [] };
  const seen = new Set();
  if (quota.list <= 0) return plan; // 一覧ページを読めない日は何もしない
  const byId = new Map(fixtures.map((f) => [f.id, f]));
  const candidates = [];
  for (const item of items) {
    const id = matchFixture(item, fixtures, clubs);
    if (id === null) { plan.unmatched.push(item); continue; }
    if (seen.has(id)) { plan.duplicates.push(item); continue; }
    seen.add(id);
    const fixture = byId.get(id);
    const patch = {};
    if (!fixture.jleague_match_url) patch.jleague_match_url = item.matchUrl;
    const manual = fixture.result_source === 'manual';
    if (!manual) {
      if (item.state === 'game-over') {
        Object.assign(patch, resultPatch(item, fixture));
        const scores = scoresOf(item);
        if (!scores) {
          plan.unknownStates.push({ fixtureId: id, state: item.state, reason: 'score missing' });
        } else if (scores[0] + scores[1] >= 1 && !fixture.scorers_fetched_at && !fixture.scorers_failed_at) {
          candidates.push({ fixture, url: item.matchUrl + 'live/' });
        }
      } else if (item.state !== 'ticket') {
        plan.unknownStates.push({ fixtureId: id, state: item.state });
      }
    }
    if (Object.keys(patch).length > 0) plan.updates.push({ id, patch });
  }
  const max = Math.max(0, Math.min(ACCESS_LIMITS.matchPagesPerRun, quota.matchPages));
  plan.matchPagesToRead = candidates
    .sort((a, b) => a.fixture.match_date.localeCompare(b.fixture.match_date))
    .slice(0, max)
    .map((c) => ({ fixtureId: c.fixture.id, url: c.url }));
  return plan;
}

// Jリーグ公式の日程・結果の一覧ページの URL（competition は 'J3' など。小文字にして使う）
export function scheduleListUrl({ competition, clubSlug, startDate, endDate }) {
  const cat = competition.toLowerCase();
  return `https://www.jleague.jp/${cat}/match/search-list/?category=${cat}&club=${clubSlug}&startdate=${startDate}&enddate=${endDate}&period=custom`;
}

// sync_runs.message（D19）。日本語の短い行を改行でつなぐ。何もなければ null
export function formatResultsMessage({ unmatched = [], duplicates = [], unknownStates = [], skipped = 0, scorerFailures = [], notApplied = [], error = null }) {
  const lines = [];
  if (error) lines.push(`エラー：${error}`);
  if (unmatched.length > 0) {
    lines.push(`照合できない試合 ${unmatched.length}件：${unmatched.map((u) => `${u.date} ${u.home?.fullName ?? u.home?.name} vs ${u.away?.fullName ?? u.away?.name}`).join('、')}`);
  }
  if (duplicates.length > 0) lines.push(`同じ試合に当たった2つ目以降 ${duplicates.length}件：${duplicates.map((d) => d.matchUrl).join('、')}`);
  if (unknownStates.length > 0) lines.push(`知らない状態：${unknownStates.map((u) => `${u.fixtureId}（${u.state}）`).join('、')}`);
  if (skipped > 0) lines.push(`試合ページの形でない URL ${skipped}件`);
  if (scorerFailures.length > 0) lines.push(`得点者を取り込めなかった試合：${scorerFailures.map((s) => `${s.fixtureId}（${s.reason}）`).join('、')}`);
  if (notApplied.length > 0) lines.push(`書き換えなかった試合（手入力など）：${notApplied.join('、')}`);
  return lines.length > 0 ? lines.join('\n') : null;
}
