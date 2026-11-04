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

function resultPatch(item, fixture) {
  const home = item.home?.score;
  const away = item.away?.score;
  if (!Number.isInteger(home) || !Number.isInteger(away)) return {};
  const want = { status: 'finished', home_score: home, away_score: away, result_source: 'api' };
  return Object.fromEntries(Object.entries(want).filter(([k, v]) => fixture[k] !== v));
}

// 戻り値：updates（書き換える列だけの patch）、matchPagesToRead、unmatched、unknownStates
export function planSync({ items, fixtures, clubs, quota }) {
  const plan = { updates: [], matchPagesToRead: [], unmatched: [], unknownStates: [] };
  if (quota.list <= 0) return plan; // 一覧ページを読めない日は何もしない
  const byId = new Map(fixtures.map((f) => [f.id, f]));
  const candidates = [];
  for (const item of items) {
    const id = matchFixture(item, fixtures, clubs);
    if (id === null) { plan.unmatched.push(item); continue; }
    const fixture = byId.get(id);
    const patch = {};
    if (!fixture.jleague_match_url) patch.jleague_match_url = item.matchUrl;
    const manual = fixture.result_source === 'manual';
    if (!manual) {
      if (item.state === 'game-over') {
        Object.assign(patch, resultPatch(item, fixture));
        const total = (item.home?.score ?? 0) + (item.away?.score ?? 0);
        if (total >= 1 && !fixture.scorers_fetched_at) candidates.push({ fixture, url: item.matchUrl + 'live/' });
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
