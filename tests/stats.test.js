import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seasonStats } from '../src/core/stats.js';

// 応援クラブは松本山雅FC（matsumoto）
const awayWin = { id: 'f1', home_club_id: 'osaka', away_club_id: 'matsumoto', status: 'finished', home_score: 1, away_score: 3, match_date: '2026-10-25' };
const homeLose = { id: 'f2', home_club_id: 'matsumoto', away_club_id: 'yamaguchi', status: 'finished', home_score: 0, away_score: 2, match_date: '2026-11-01' };
const scheduled = { id: 'f3', home_club_id: 'matsumoto', away_club_id: 'kofu', status: 'scheduled', home_score: null, away_score: null, match_date: '2026-11-08' };
const fixturesById = { f1: awayWin, f2: homeLose, f3: scheduled };

const noCosts = { cost_transport: null, cost_lodging: null, cost_ticket: null, cost_goods: null, cost_food: null };

test('seasonStats: 記録がないときは全部0', () => {
  assert.deepEqual(seasonStats([], {}, 'matsumoto'), {
    count: 0, byStyle: { stadium: 0, broadcast: 0, public_viewing: 0 }, win: 0, draw: 0, lose: 0,
    costs: { transport: 0, lodging: 0, ticket: 0, goods: 0, food: 0 }, costTotal: 0,
  });
});

test('seasonStats: 現地で勝ち（費用の一部が null）と中継で負けの2件', () => {
  const records = [
    { fixture_id: 'f1', watch_style: 'stadium', cost_transport: 5000, cost_lodging: null, cost_ticket: 4000, cost_goods: null, cost_food: 1200 },
    { fixture_id: 'f2', watch_style: 'broadcast', cost_transport: null, cost_lodging: 8000, cost_ticket: null, cost_goods: 0, cost_food: null },
  ];
  assert.deepEqual(seasonStats(records, fixturesById, 'matsumoto'), {
    count: 2,
    byStyle: { stadium: 1, broadcast: 1, public_viewing: 0 },
    win: 1, draw: 0, lose: 1,
    costs: { transport: 5000, lodging: 8000, ticket: 4000, goods: 0, food: 1200 },
    costTotal: 18200,
  });
});

test('seasonStats: 結果が決まらない記録（予定の試合・試合がない記録）は count と byStyle だけに数える', () => {
  const records = [
    { fixture_id: 'f3', watch_style: 'public_viewing', ...noCosts, cost_ticket: 3000 },
    { fixture_id: 'missing', watch_style: 'stadium', ...noCosts },
    { fixture_id: 'f1', watch_style: 'stadium', ...noCosts },
  ];
  assert.deepEqual(seasonStats(records, fixturesById, 'matsumoto'), {
    count: 3,
    byStyle: { stadium: 2, broadcast: 0, public_viewing: 1 },
    win: 1, draw: 0, lose: 0,
    costs: { transport: 0, lodging: 0, ticket: 3000, goods: 0, food: 0 },
    costTotal: 3000,
  });
});

test('seasonStats: 引き分けを数える', () => {
  const draw = { id: 'f4', home_club_id: 'matsumoto', away_club_id: 'osaka', status: 'finished', home_score: 2, away_score: 2, match_date: '2026-11-03' };
  const result = seasonStats([{ fixture_id: 'f4', watch_style: 'stadium', ...noCosts }], { f4: draw }, 'matsumoto');
  assert.equal(result.draw, 1);
  assert.equal(result.win, 0);
  assert.equal(result.lose, 0);
});

test('seasonStats: PK戦の勝ち・負けを数える', () => {
  const pk = { id: 'f5', home_club_id: 'matsumoto', away_club_id: 'shonan', status: 'finished', home_score: 3, away_score: 3, home_pk: 3, away_pk: 4, match_date: '2026-11-01' };
  const result = seasonStats([{ fixture_id: 'f5', watch_style: 'stadium', ...noCosts }], { f5: pk }, 'matsumoto');
  assert.equal(result.lose, 1);
  assert.equal(result.draw, 0);
});
