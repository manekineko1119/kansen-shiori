// 観戦記録の集計（設計書 5.7）。純粋な関数だけ（DOM・通信・現在時刻を使わない）

import { matchOutcome } from './result.js';

const COST_KEYS = ['transport', 'lodging', 'ticket', 'goods', 'food'];

// records：match_records の配列、fixturesById：{ [id]: fixture }、supportClubId：応援クラブの id
// 結果が決まらない記録（予定の試合・試合がない記録）は count と byStyle にだけ数える
export function seasonStats(records, fixturesById, supportClubId) {
  const stats = {
    count: 0,
    byStyle: { stadium: 0, broadcast: 0, public_viewing: 0 },
    win: 0,
    draw: 0,
    lose: 0,
    costs: { transport: 0, lodging: 0, ticket: 0, goods: 0, food: 0 },
    costTotal: 0,
  };

  for (const record of records) {
    stats.count += 1;
    if (record.watch_style in stats.byStyle) stats.byStyle[record.watch_style] += 1;

    const fixture = fixturesById[record.fixture_id];
    const outcome = fixture ? matchOutcome(fixture, supportClubId) : null;
    if (outcome === 'win') stats.win += 1;
    else if (outcome === 'draw') stats.draw += 1;
    else if (outcome === 'lose') stats.lose += 1;

    for (const key of COST_KEYS) {
      const value = record[`cost_${key}`] ?? 0;
      stats.costs[key] += value;
      stats.costTotal += value;
    }
  }

  return stats;
}
