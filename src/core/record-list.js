// 観戦記録の一覧の行の判断（設計書 3.4.2）。純粋な関数だけ
import { fixtureSide } from './fixture-view.js';
import { matchOutcome, formatScore } from './result.js';
import { compareFixturesNewestFirst } from './fixture-order.js';

const STYLE_TEXT = { stadium: '現地', public_viewing: 'PV', broadcast: '中継' };

// そのシーズンの終わった試合（status = 'finished'、今日まで）すべて。記録がなければ record は null・style は「記録なし」
// onlyStadium：現地観戦した試合（watch_style = 'stadium'）だけにする
export function recordRows({ fixtures, records, supportClubId, today, onlyStadium }) {
  const byFixture = new Map((records ?? []).map((r) => [r.fixture_id, r]));
  return (fixtures ?? [])
    .filter((f) => f.status === 'finished' && f.match_date <= today)
    .sort(compareFixturesNewestFirst)
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
    .filter((r) => !onlyStadium || r.record?.watch_style === 'stadium');
}

// 一覧の行の勝-分-敗。絞り込みなしならシーズンの成績、現地だけなら現地観戦の成績になる。結果の入っていない試合は数えない
export function outcomeCounts(rows) {
  const counts = { win: 0, draw: 0, lose: 0 };
  for (const r of rows) if (r.outcome in counts) counts[r.outcome] += 1;
  return counts;
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

// 観戦記録の詳細（#/records/<試合ID>）。現地だけに絞っているときは ?only=1 を付けて、左の一覧の絞り込みを残す
export function recordHref(id, { only = false } = {}) {
  return `#/records/${encodeURIComponent(id)}${only ? '?only=1' : ''}`;
}

// 見ているシーズン。指定がない・今のシーズン・知らない値は今のシーズン。選択肢を読み込み中・読めないときは指定どおり
export function pickSeason({ requested, currentId, seasons }) {
  if (!requested || requested === currentId) return currentId;
  if (Array.isArray(seasons) && !seasons.some((s) => s.id === requested)) return currentId;
  return requested;
}

export const seasonLabel = (id) => `${id}シーズン`;
