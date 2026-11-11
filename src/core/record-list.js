// 観戦記録の一覧の行の判断（設計書 3.4.2）。純粋な関数だけ
import { fixtureSide } from './fixture-view.js';
import { matchOutcome, formatScore } from './result.js';

const STYLE_TEXT = { stadium: '現地', public_viewing: 'PV', broadcast: '中継' };

// 日付の新しい順 → キックオフの遅い順（未定は先に）→ ID
function newestFirst(a, b) {
  if (a.match_date !== b.match_date) return a.match_date < b.match_date ? 1 : -1;
  const ka = a.kickoff ?? '99:99';
  const kb = b.kickoff ?? '99:99';
  if (ka !== kb) return ka < kb ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// そのシーズンの終わった試合（status = 'finished'、今日より前）すべて。記録がなければ record は null・style は「記録なし」
export function recordRows({ fixtures, records, supportClubId, today, onlyWatched }) {
  const byFixture = new Map((records ?? []).map((r) => [r.fixture_id, r]));
  return (fixtures ?? [])
    .filter((f) => f.status === 'finished' && f.match_date < today)
    .sort(newestFirst)
    .map((f) => {
      const record = byFixture.get(f.id) ?? null;
      return {
        fixture: f,
        record,
        side: fixtureSide(f, supportClubId),
        outcome: matchOutcome(f, supportClubId),
        score: formatScore(f, supportClubId),
        style: record ? (STYLE_TEXT[record.watch_style] ?? '記録あり') : '記録なし',
      };
    })
    .filter((r) => !onlyWatched || r.record !== null);
}

// '#/records?s=<シーズンID>&only=1' の ? 以降。どちらもなくてよい
export function parseRecordsQuery(query) {
  const p = new URLSearchParams(query ?? '');
  return { season: p.get('s') || null, only: p.get('only') === '1' };
}

// 既定の値（今のシーズン・絞り込みなし）は URL に書かない
export function recordsHref({ season = null, only = false } = {}) {
  const p = new URLSearchParams();
  if (season) p.set('s', season);
  if (only) p.set('only', '1');
  const q = p.toString();
  return q ? `#/records?${q}` : '#/records';
}

// 見ているシーズン。指定がない・今のシーズン・知らない値は今のシーズン。選択肢を読み込み中・読めないときは指定どおり
export function pickSeason({ requested, currentId, seasons }) {
  if (!requested || requested === currentId) return currentId;
  if (Array.isArray(seasons) && !seasons.some((s) => s.id === requested)) return currentId;
  return requested;
}

export const seasonLabel = (id) => `${id}シーズン`;
