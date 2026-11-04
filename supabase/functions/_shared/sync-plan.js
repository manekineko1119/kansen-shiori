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
// skipFixtureIds：試合ページを読まない試合の id（配列か Set）。結果の更新は許す
export function planSync({ items, fixtures, clubs, quota, skipFixtureIds = [] }) {
  const plan = { updates: [], matchPagesToRead: [], unmatched: [], duplicates: [], unknownStates: [] };
  const skip = new Set(skipFixtureIds);
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
        } else if (scores[0] + scores[1] >= 1 && !fixture.scorers_fetched_at && !skip.has(id)) {
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
