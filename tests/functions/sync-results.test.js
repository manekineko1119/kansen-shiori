import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runSyncResults } from '../../supabase/functions/sync-results/run.js';
import { scheduleListUrl } from '../../supabase/functions/_shared/sync-plan.js';

const read = (name) => readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8');
const LIST = read('jleague-list.html');
const GOALS = read('jleague-match-goals.html');
const BROKEN = read('jleague-match-broken.html');

const clubs = [
  { id: 'matsumoto', name: '松本山雅FC', short_name: '松本', aliases: [], jleague_url: 'https://www.jleague.jp/club/matsumoto/' },
  { id: 'yamaguchi', name: 'レノファ山口FC', short_name: '山口', aliases: [] },
];
const fixture = { id: 'f1', match_date: '2026-10-25', home_club_id: 'matsumoto', away_club_id: 'yamaguchi', status: 'scheduled', result_source: null, scorers_fetched_at: null, scorers_failed_at: null, jleague_match_url: null };
const NOW = Date.UTC(2026, 10, 9, 22, 0); // 日本時間 11/10 7:00

// 偽物の db。呼ばれた引数を calls に残す
function makeDb(over = {}) {
  const calls = { runsSince: [], applyResult: [], applyScorers: [], insertRun: [] };
  const db = {
    currentSeason: async () => ({ id: 's2026', starts_on: '2026-08-08' }),
    club: async (id) => clubs.find((c) => c.id === id) ?? null,
    competitionOf: async () => 'J3',
    runsSince: async (iso) => { calls.runsSince.push(iso); return []; },
    fixturesOf: async () => [fixture],
    clubs: async () => clubs,
    applyResult: async (id, patch) => { calls.applyResult.push([id, patch]); return true; },
    applyScorers: async (id, scorers) => { calls.applyScorers.push([id, scorers]); return true; },
    insertRun: async (row) => { calls.insertRun.push(row); },
    ...over,
  };
  return { db, calls };
}

function makeIo(pages) {
  const urls = [];
  const sleeps = [];
  return {
    urls,
    sleeps,
    fetchText: async (url) => {
      urls.push(url);
      const p = pages(url);
      if (p instanceof Error) throw p;
      return p;
    },
    sleep: async (ms) => { sleeps.push([ms, urls.length]); },
  };
}

const listUrl = scheduleListUrl({ competition: 'J3', clubSlug: 'matsumoto', startDate: '2026-08-08', endDate: '2026-11-10' });
const pageOk = (url) => (url === listUrl ? LIST : GOALS);

test('正常：一覧1回・試合ページ1回、結果と得点者を書き、記録は1回', async () => {
  const { db, calls } = makeDb();
  const io = makeIo(pageOk);
  const r = await runSyncResults({ db, fetchText: io.fetchText, sleep: io.sleep, nowMs: NOW, clubId: 'matsumoto' });
  assert.deepEqual(io.urls, [listUrl, 'https://www.jleague.jp/match/j3/2026/102517/live/']);
  assert.deepEqual(io.sleeps, [[2000, 1]]); // 試合ページを読む前（それまでの取得は1回）
  assert.deepEqual(calls.applyResult, [['f1', { jleague_match_url: 'https://www.jleague.jp/match/j3/2026/102517/', status: 'finished', home_score: 0, away_score: 2, result_source: 'api' }]]);
  assert.equal(calls.applyScorers.length, 1);
  assert.equal(calls.applyScorers[0][0], 'f1');
  assert.equal(calls.applyScorers[0][1].length, 4);
  assert.equal(calls.insertRun.length, 1);
  const row = calls.insertRun[0];
  assert.equal(row.job, 'results');
  assert.equal(row.ok, true);
  assert.equal(row.list_read, 1);
  assert.equal(row.pages_read, 1);
  assert.deepEqual(r, { ok: true, message: row.message, list_read: 1, pages_read: 1 });
});

test('上限：今日の一覧が上限なら何も読まずに記録して終わる', async () => {
  const { db, calls } = makeDb({ runsSince: async () => [{ job: 'results', list_read: 2, pages_read: 0 }] });
  const io = makeIo(pageOk);
  const r = await runSyncResults({ db, fetchText: io.fetchText, sleep: io.sleep, nowMs: NOW, clubId: 'matsumoto' });
  assert.deepEqual(io.urls, []);
  assert.equal(calls.insertRun.length, 1);
  assert.equal(calls.insertRun[0].ok, false);
  assert.equal(calls.insertRun[0].list_read, 0);
  assert.equal(calls.insertRun[0].pages_read, 0);
  assert.match(calls.insertRun[0].message, /上限/);
  assert.equal(r.ok, false);
});

test('「今日」は日本時間：UTC 15:30 は翌日の日付', async () => {
  const { db, calls } = makeDb();
  const io = makeIo(pageOk);
  await runSyncResults({ db, fetchText: io.fetchText, sleep: io.sleep, nowMs: Date.UTC(2026, 10, 9, 15, 30), clubId: 'matsumoto' });
  assert.deepEqual(calls.runsSince, ['2026-11-09T15:00:00.000Z']);
  assert.equal(io.urls[0], listUrl);
  assert.match(io.urls[0], /enddate=2026-11-10/);
});

test('一覧の取得が投げる：エラーを記録し、何も書かない', async () => {
  const { db, calls } = makeDb();
  const io = makeIo((url) => (url === listUrl ? new Error('Jリーグ公式の応答が 503') : GOALS));
  const r = await runSyncResults({ db, fetchText: io.fetchText, sleep: io.sleep, nowMs: NOW, clubId: 'matsumoto' });
  assert.equal(calls.insertRun.length, 1);
  assert.equal(calls.insertRun[0].ok, false);
  assert.equal(calls.insertRun[0].list_read, 1);
  assert.equal(calls.insertRun[0].pages_read, 0);
  assert.match(calls.insertRun[0].message, /Jリーグ公式の応答が 503/);
  assert.deepEqual(calls.applyResult, []);
  assert.equal(r.ok, false);
});

test('一覧にデータがない：parseScheduleList の理由を記録する', async () => {
  const { db, calls } = makeDb();
  const io = makeIo(() => '<html></html>');
  const r = await runSyncResults({ db, fetchText: io.fetchText, sleep: io.sleep, nowMs: NOW, clubId: 'matsumoto' });
  assert.equal(r.ok, false);
  assert.equal(r.list_read, 1);
  assert.match(calls.insertRun[0].message, /一覧ページに試合のデータが見つかりません/);
  assert.deepEqual(calls.applyResult, []);
});

test('試合ページの取得が投げる：得点者は null（失敗の印）、取り込み全体は ok', async () => {
  const { db, calls } = makeDb();
  const io = makeIo((url) => (url === listUrl ? LIST : new Error('Jリーグ公式の応答が 500')));
  await runSyncResults({ db, fetchText: io.fetchText, sleep: io.sleep, nowMs: NOW, clubId: 'matsumoto' });
  assert.deepEqual(calls.applyScorers, [['f1', null]]);
  assert.equal(calls.insertRun.length, 1);
  assert.equal(calls.insertRun[0].ok, true);
  assert.equal(calls.insertRun[0].pages_read, 1);
  assert.match(calls.insertRun[0].message, /f1/);
});

test('試合ページの得点者の数が合わない：得点者は null', async () => {
  const { db, calls } = makeDb();
  const io = makeIo((url) => (url === listUrl ? LIST : BROKEN));
  await runSyncResults({ db, fetchText: io.fetchText, sleep: io.sleep, nowMs: NOW, clubId: 'matsumoto' });
  assert.deepEqual(calls.applyScorers, [['f1', null]]);
  assert.match(calls.insertRun[0].message, /得点者を取り込めなかった試合：f1/);
});

test('applyResult が false（読んでいる間に手で直された）：message に書き換えなかった試合', async () => {
  const { db, calls } = makeDb({ applyResult: async () => false });
  const io = makeIo(pageOk);
  await runSyncResults({ db, fetchText: io.fetchText, sleep: io.sleep, nowMs: NOW, clubId: 'matsumoto' });
  assert.match(calls.insertRun[0].message, /書き換えなかった試合（手入力など）：f1/);
});

test('insertRun 以外で例外：それでも記録は1回、ok は false', async () => {
  const { db, calls } = makeDb({ fixturesOf: async () => { throw new Error('DB が落ちた'); } });
  const io = makeIo(pageOk);
  const r = await runSyncResults({ db, fetchText: io.fetchText, sleep: io.sleep, nowMs: NOW, clubId: 'matsumoto' });
  assert.equal(calls.insertRun.length, 1);
  assert.equal(calls.insertRun[0].ok, false);
  assert.match(calls.insertRun[0].message, /DB が落ちた/);
  assert.equal(r.ok, false);
});

test('クラブに jleague_url がない：一覧を読まずに失敗', async () => {
  const { db, calls } = makeDb({ club: async () => ({ id: 'matsumoto', jleague_url: null }) });
  const io = makeIo(pageOk);
  const r = await runSyncResults({ db, fetchText: io.fetchText, sleep: io.sleep, nowMs: NOW, clubId: 'matsumoto' });
  assert.deepEqual(io.urls, []);
  assert.equal(r.ok, false);
  assert.equal(r.list_read, 0);
  assert.equal(calls.insertRun.length, 1);
});

test('今のシーズンの season_clubs にない：一覧を読まずに失敗', async () => {
  const { db, calls } = makeDb({ competitionOf: async () => null });
  const io = makeIo(pageOk);
  const r = await runSyncResults({ db, fetchText: io.fetchText, sleep: io.sleep, nowMs: NOW, clubId: 'matsumoto' });
  assert.deepEqual(io.urls, []);
  assert.equal(r.ok, false);
  assert.equal(r.list_read, 0);
  assert.equal(calls.insertRun.length, 1);
});
