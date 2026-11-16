import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ownScore, oppScore, matchOutcome, OUTCOME_MARK, OUTCOME_LABEL, formatScore, recentForm,
  isPkDecided, outcomeLabel,
} from '../src/core/result.js';

const away = { home_club_id: 'osaka', away_club_id: 'matsumoto', status: 'finished', home_score: 1, away_score: 3, match_date: '2026-10-25' };
const home = { ...away, home_club_id: 'matsumoto', away_club_id: 'yamaguchi', home_score: 0, away_score: 2 };

test('ownScore / oppScore: アウェイでは away_score が自分の得点', () => {
  assert.equal(ownScore(away, 'matsumoto'), 3);
  assert.equal(oppScore(away, 'matsumoto'), 1);
});

test('ownScore / oppScore: ホームでは home_score が自分の得点', () => {
  assert.equal(ownScore(home, 'matsumoto'), 0);
  assert.equal(oppScore(home, 'matsumoto'), 2);
});

test('matchOutcome: 勝ち・負け・引き分け', () => {
  assert.equal(matchOutcome(away, 'matsumoto'), 'win');
  assert.equal(matchOutcome(home, 'matsumoto'), 'lose');
  assert.equal(matchOutcome({ ...home, away_score: 0 }, 'matsumoto'), 'draw');
});

test('matchOutcome: 終わっていない・スコア未登録は null', () => {
  assert.equal(matchOutcome({ ...home, status: 'scheduled' }, 'matsumoto'), null);
  assert.equal(matchOutcome({ ...home, home_score: null, away_score: null }, 'matsumoto'), null);
});

test('formatScore: 応援クラブの得点を先に書く', () => {
  assert.equal(formatScore(away, 'matsumoto'), '3-1');
  assert.equal(formatScore(home, 'matsumoto'), '0-2');
});

test('formatScore: 延期など終わっていない試合は null', () => {
  assert.equal(formatScore({ ...home, status: 'postponed' }, 'matsumoto'), null);
});

test('OUTCOME_MARK / OUTCOME_LABEL', () => {
  assert.deepEqual(OUTCOME_MARK, { win: '○', lose: '●', draw: '△' });
  assert.deepEqual(OUTCOME_LABEL, { win: '勝ち', lose: '負け', draw: '引き分け' });
});

// 7試合：ホームとアウェイが混ざる。10/18 はスコア未登録、11/15 は今日
const m = (date, homeId, awayId, hs, as, status = 'finished') => ({
  home_club_id: homeId, away_club_id: awayId, status, home_score: hs, away_score: as, match_date: date,
});
const list = [
  m('2026-10-04', 'osaka', 'matsumoto', 0, 2),          // アウェイ 勝ち
  m('2026-10-11', 'matsumoto', 'kofu', 1, 3),           // ホーム 負け
  m('2026-10-18', 'tokushima', 'matsumoto', null, null), // スコア未登録
  m('2026-10-25', 'matsumoto', 'yamaguchi', 2, 2),      // ホーム 引き分け
  m('2026-11-01', 'kochi', 'matsumoto', 1, 4),          // アウェイ 勝ち
  m('2026-11-08', 'matsumoto', 'nagano', 3, 0),         // ホーム 勝ち
  m('2026-11-15', 'matsumoto', 'toyama', 1, 0),         // 今日（含めない）
];

test('recentForm: 今日より前の試合を古い順に、スコア未登録と当日は除く', () => {
  assert.deepEqual(recentForm(list, 'matsumoto', '2026-11-15'), ['win', 'lose', 'draw', 'win', 'win']);
});

test('recentForm: 5試合未満ならあるだけ返す', () => {
  assert.deepEqual(recentForm(list.slice(0, 2), 'matsumoto', '2026-11-15'), ['win', 'lose']);
});

test('recentForm: 最後の n 件だけ返す', () => {
  assert.deepEqual(recentForm(list, 'matsumoto', '2026-11-15', 3), ['draw', 'win', 'win']);
});

test('recentForm: 並びが古い順でなくても日付順に数える', () => {
  const shuffled = [list[4], list[0], list[3], list[1]];
  assert.deepEqual(recentForm(shuffled, 'matsumoto', '2026-11-15'), ['win', 'lose', 'draw', 'win']);
});

test('recentForm: n が 0 以下なら空', () => {
  assert.deepEqual(recentForm(list, 'matsumoto', '2026-11-15', 0), []);
  assert.deepEqual(recentForm(list, 'matsumoto', '2026-11-15', -2), []);
});

// PK戦：同点のときだけ PK を見る。PK 勝ちは勝ち、PK 負けは負け
const pk = { status: 'finished', home_club_id: 'matsumoto', away_club_id: 'shonan', home_score: 3, away_score: 3, home_pk: 3, away_pk: 4, match_date: '2026-11-01' };

test('PK戦: 勝ち・負けとして判定し、スコアに PK を添える（応援クラブが先）', () => {
  assert.equal(matchOutcome(pk, 'matsumoto'), 'lose');
  assert.equal(matchOutcome(pk, 'shonan'), 'win');
  assert.equal(formatScore(pk, 'matsumoto'), '3-3（PK 3-4）');
  assert.equal(formatScore(pk, 'shonan'), '3-3（PK 4-3）');
  assert.equal(ownScore(pk, 'matsumoto'), 3);
  assert.equal(oppScore(pk, 'matsumoto'), 3);
});

test('PK戦: outcomeLabel は PK勝ち・PK負け・引き分け', () => {
  assert.equal(outcomeLabel(pk, 'shonan'), 'PK勝ち');
  assert.equal(outcomeLabel(pk, 'matsumoto'), 'PK負け');
  assert.equal(outcomeLabel({ ...pk, home_pk: null, away_pk: null }, 'matsumoto'), '引き分け');
  assert.equal(outcomeLabel(away, 'matsumoto'), '勝ち');
  assert.equal(outcomeLabel({ ...pk, status: 'scheduled' }, 'matsumoto'), null);
});

test('PK戦: isPkDecided は同点・両方が整数のときだけ true', () => {
  assert.equal(isPkDecided(pk), true);
  assert.equal(isPkDecided({ ...pk, home_pk: null, away_pk: null }), false);
  assert.equal(isPkDecided({ ...pk, home_score: 2 }), false);
});

test('PK戦: PK がなければ同点は引き分けのまま', () => {
  assert.equal(matchOutcome({ ...pk, home_pk: null, away_pk: null }, 'matsumoto'), 'draw');
  assert.equal(formatScore({ ...pk, home_pk: null, away_pk: null }, 'matsumoto'), '3-3');
});

test('PK戦: recentForm は PK 負けを負けとして数える', () => {
  assert.deepEqual(recentForm([pk], 'matsumoto', '2026-11-15'), ['lose']);
});
