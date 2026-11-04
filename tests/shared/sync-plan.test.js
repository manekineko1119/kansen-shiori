import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACCESS_LIMITS, remainingQuota, planSync } from '../../supabase/functions/_shared/sync-plan.js';

const clubs = [
  { id: 'matsumoto', name: '松本山雅FC', short_name: '松本', aliases: [] },
  { id: 'yamaguchi', name: 'レノファ山口FC', short_name: '山口', aliases: [] },
];
const base = { id: 'f1', match_date: '2026-10-25', home_club_id: 'matsumoto', away_club_id: 'yamaguchi', status: 'scheduled', result_source: null, scorers_fetched_at: null, jleague_match_url: null };
const item = { matchUrl: 'https://www.jleague.jp/match/j3/2026/102517/', date: '2026-10-25', state: 'game-over', home: { fullName: '松本山雅ＦＣ', score: 0 }, away: { fullName: 'レノファ山口ＦＣ', score: 2 } };
const quota = { list: 1, matchPages: 10 };

test('アクセスの上限の値', () => {
  assert.deepEqual(ACCESS_LIMITS, { listPerRun: 1, matchPagesPerRun: 5, listPerDay: 2, matchPagesPerDay: 10, intervalMs: 2000 });
});

test('試合終了は照合してURL・状態・スコアを書き、試合ページを読む', () => {
  const p = planSync({ items: [item], fixtures: [base], clubs, quota });
  assert.deepEqual(p.updates, [{ id: 'f1', patch: { jleague_match_url: item.matchUrl, status: 'finished', home_score: 0, away_score: 2, result_source: 'api' } }]);
  assert.deepEqual(p.matchPagesToRead, [{ fixtureId: 'f1', url: item.matchUrl + 'live/' }]);
  assert.deepEqual(p.unmatched, []);
  assert.deepEqual(p.unknownStates, []);
});

test('手入力の試合は上書きせず、URLだけ埋め、試合ページも読まない', () => {
  const m = { ...base, result_source: 'manual', status: 'finished', home_score: 1, away_score: 2 };
  const p = planSync({ items: [item], fixtures: [m], clubs, quota });
  assert.deepEqual(p.updates[0].patch, { jleague_match_url: item.matchUrl });
  assert.deepEqual(p.matchPagesToRead, []);
  const set = planSync({ items: [item], fixtures: [{ ...m, jleague_match_url: 'https://x/' }], clubs, quota });
  assert.deepEqual(set.updates, []);
});

test('0-0 は試合ページを読まない', () => {
  const nil = { ...item, home: { ...item.home, score: 0 }, away: { ...item.away, score: 0 } };
  const p = planSync({ items: [nil], fixtures: [base], clubs, quota });
  assert.deepEqual(p.matchPagesToRead, []);
  assert.equal(p.updates[0].patch.status, 'finished');
});

test('得点者を取得済みの試合は試合ページを読まない', () => {
  const f = { ...base, scorers_fetched_at: '2026-10-26T00:00:00Z' };
  assert.deepEqual(planSync({ items: [item], fixtures: [f], clubs, quota }).matchPagesToRead, []);
});

test('すでに同じ内容なら更新に含めない', () => {
  const f = { ...base, status: 'finished', home_score: 0, away_score: 2, result_source: 'api', jleague_match_url: item.matchUrl, scorers_fetched_at: 'x' };
  assert.deepEqual(planSync({ items: [item], fixtures: [f], clubs, quota }).updates, []);
});

test('ticket はURLだけ埋め、キックオフなどは変えない', () => {
  const t = { ...item, state: 'ticket', home: { ...item.home, score: null }, away: { ...item.away, score: null } };
  const p = planSync({ items: [t], fixtures: [base], clubs, quota });
  assert.deepEqual(p.updates, [{ id: 'f1', patch: { jleague_match_url: item.matchUrl } }]);
  assert.deepEqual(p.matchPagesToRead, []);
  assert.deepEqual(p.unknownStates, []);
});

test('未知の state はURLだけ埋め、unknownStates に残す', () => {
  const u = { ...item, state: 'postponed' };
  const p = planSync({ items: [u], fixtures: [base], clubs, quota });
  assert.deepEqual(p.updates, [{ id: 'f1', patch: { jleague_match_url: item.matchUrl } }]);
  assert.deepEqual(p.matchPagesToRead, []);
  assert.deepEqual(p.unknownStates, [{ fixtureId: 'f1', state: 'postponed' }]);
});

function sevenFixtures() {
  const fixtures = []; const items = [];
  for (let i = 0; i < 7; i++) {
    const d = `2026-10-${String(10 + i).padStart(2, '0')}`;
    fixtures.push({ ...base, id: `g${i}`, match_date: d });
    items.push({ ...item, matchUrl: `https://www.jleague.jp/match/j3/2026/${i}/`, date: d });
  }
  return { fixtures: fixtures.reverse(), items: items.reverse() };
}

test('未取得が7試合なら1回の上限5件、日付の古い順', () => {
  const { fixtures, items } = sevenFixtures();
  const p = planSync({ items, fixtures, clubs, quota });
  assert.deepEqual(p.matchPagesToRead.map((r) => r.fixtureId), ['g0', 'g1', 'g2', 'g3', 'g4']);
  assert.equal(p.updates.length, 7);
});

test('1日の残りが2件なら2件だけ', () => {
  const { fixtures, items } = sevenFixtures();
  const p = planSync({ items, fixtures, clubs, quota: { list: 1, matchPages: 2 } });
  assert.deepEqual(p.matchPagesToRead.map((r) => r.fixtureId), ['g0', 'g1']);
});

test('一覧の残りが0なら何も計画しない', () => {
  const p = planSync({ items: [item], fixtures: [base], clubs, quota: { list: 0, matchPages: 10 } });
  assert.deepEqual(p.updates, []);
  assert.deepEqual(p.matchPagesToRead, []);
});

test('照合できない item は unmatched に入る', () => {
  const other = { ...item, date: '2026-10-26' };
  const p = planSync({ items: [other], fixtures: [base], clubs, quota });
  assert.deepEqual(p.unmatched, [other]);
  assert.deepEqual(p.updates, []);
});

test('残りの回数は results の行だけ数える', () => {
  assert.deepEqual(remainingQuota([{ job: 'results', list_read: 1, pages_read: 4 }, { job: 'videos', list_read: 0, pages_read: 0 }]), { list: 1, matchPages: 6 });
  assert.deepEqual(remainingQuota([]), { list: 2, matchPages: 10 });
  assert.deepEqual(remainingQuota([{ job: 'results', list_read: 3, pages_read: 12 }]), { list: 0, matchPages: 0 });
});
