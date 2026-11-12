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
  const calls = { reserveRun: [], finishRun: [], applyResult: [], applyScorers: [], insertRun: [] };
  const db = {
    currentSeason: async () => ({ id: 's2026', starts_on: '2026-08-08' }),
    club: async (id) => clubs.find((c) => c.id === id) ?? null,
    competitionOf: async () => 'J3',
    reserveRun: async (args) => { calls.reserveRun.push(args); return { runId: 7, pagesAllowed: 5 }; },
    skipReason: async () => 'limit',
    finishRun: async (id, row) => { calls.finishRun.push([id, row]); return true; },
    fixturesOf: async () => [fixture],
    clubs: async () => clubs,
    applyResult: async (id, patch) => { calls.applyResult.push([id, patch]); return true; },
    applyScorers: async (id, scorers) => { calls.applyScorers.push([id, scorers]); return true; },
    insertRun: async (row) => { calls.insertRun.push(row); },
    ...over,
  };
  return { db, calls };
}

// 最後の記録（予約できたときは finishRun、できなかったときは insertRun）
const finalRow = (calls) => calls.finishRun[0]?.[1] ?? calls.insertRun[0];
const recordCount = (calls) => calls.insertRun.length + calls.finishRun.length;

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
  assert.deepEqual(io.urls, [listUrl, 'https://www.jleague.jp/match/j3/2026/102517/lineup/']);
  assert.deepEqual(io.sleeps, [[2000, 1]]); // 試合ページを読む前（それまでの取得は1回）
  assert.deepEqual(calls.applyResult, [['f1', { jleague_match_url: 'https://www.jleague.jp/match/j3/2026/102517/', status: 'finished', home_score: 0, away_score: 2, result_source: 'api' }]]);
  assert.equal(calls.applyScorers.length, 1);
  assert.equal(calls.applyScorers[0][0], 'f1');
  assert.equal(calls.applyScorers[0][1].length, 4);
  assert.equal(recordCount(calls), 1);
  const row = finalRow(calls);
  assert.equal(calls.insertRun.length, 0);
  assert.equal(calls.finishRun[0][0], 7);
  assert.equal(row.ok, true);
  assert.equal(row.list_read, 1);
  assert.equal(row.pages_read, 1);
  assert.deepEqual(r, { ok: true, message: row.message, list_read: 1, pages_read: 1, skipped_reason: null });
});

test('上限：予約が0行で理由が limit なら、一覧を読まず skipped_reason: limit の行を残す', async () => {
  const { db, calls } = makeDb({ reserveRun: async () => null, skipReason: async () => 'limit' });
  const io = makeIo(pageOk);
  const r = await runSyncResults({ db, fetchText: io.fetchText, sleep: io.sleep, nowMs: NOW, clubId: 'matsumoto' });
  assert.deepEqual(io.urls, []);
  assert.deepEqual(calls.finishRun, []);
  assert.deepEqual(calls.insertRun, [{
    job: 'results', ok: false, message: '今日の一覧ページを読む回数の上限に達しているため、読みませんでした',
    list_read: 0, pages_read: 0, skipped_reason: 'limit',
  }]);
  assert.equal(r.ok, false);
  assert.equal(r.skipped_reason, 'limit');
});

test('実行中：予約が0行で理由が running なら、一覧を読まず skipped_reason: running の行を残す', async () => {
  const { db, calls } = makeDb({ reserveRun: async () => null, skipReason: async () => 'running' });
  const io = makeIo(pageOk);
  const r = await runSyncResults({ db, fetchText: io.fetchText, sleep: io.sleep, nowMs: NOW, clubId: 'matsumoto' });
  assert.deepEqual(io.urls, []);
  assert.deepEqual(calls.insertRun, [{
    job: 'results', ok: false, message: '実行中のため読みません',
    list_read: 0, pages_read: 0, skipped_reason: 'running',
  }]);
  assert.equal(r.skipped_reason, 'running');
});

test('読まなかった理由が分からない値なら limit として残す（check 制約に当たらない）', async () => {
  const { db, calls } = makeDb({ reserveRun: async () => null, skipReason: async () => null });
  await runSyncResults({ db, fetchText: makeIo(pageOk).fetchText, sleep: async () => {}, nowMs: NOW, clubId: 'matsumoto' });
  assert.equal(calls.insertRun[0].skipped_reason, 'limit');
});

test('clubId の形が違う：DB も Jリーグ公式も読まず、失敗として記録する', async () => {
  for (const clubId of ['', 'Matsumoto', 'a,b', 'x.eq.y', 'matsumoto)']) {
    let touched = 0;
    const { db, calls } = makeDb({ currentSeason: async () => { touched += 1; return null; }, club: async () => { touched += 1; return null; } });
    const io = makeIo(pageOk);
    const r = await runSyncResults({ db, fetchText: io.fetchText, sleep: io.sleep, nowMs: NOW, clubId });
    assert.deepEqual([io.urls, touched, calls.reserveRun.length], [[], 0, 0], clubId);
    assert.equal(r.ok, false);
    assert.equal(calls.insertRun.length, 1);
    assert.match(calls.insertRun[0].message, /club_id の形が正しくありません/);
    assert.equal(calls.insertRun[0].skipped_reason, null);
  }
});

test('「今日」は日本時間：UTC 15:30 は翌日の日付', async () => {
  const { db, calls } = makeDb();
  const io = makeIo(pageOk);
  await runSyncResults({ db, fetchText: io.fetchText, sleep: io.sleep, nowMs: Date.UTC(2026, 10, 9, 15, 30), clubId: 'matsumoto' });
  assert.deepEqual(calls.reserveRun, [{ dayStartIso: '2026-11-09T15:00:00.000Z', listLimit: 2, pagesLimit: 10, pagesPerRun: 5 }]);
  assert.equal(io.urls[0], listUrl);
  assert.match(io.urls[0], /enddate=2026-11-10/);
});

test('一覧の取得が投げる：エラーを記録し、何も書かない', async () => {
  const { db, calls } = makeDb();
  const io = makeIo((url) => (url === listUrl ? new Error('Jリーグ公式の応答が 503') : GOALS));
  const r = await runSyncResults({ db, fetchText: io.fetchText, sleep: io.sleep, nowMs: NOW, clubId: 'matsumoto' });
  assert.equal(recordCount(calls), 1);
  assert.equal(finalRow(calls).ok, false);
  assert.equal(finalRow(calls).list_read, 1);
  assert.equal(finalRow(calls).pages_read, 0);
  assert.match(finalRow(calls).message, /Jリーグ公式の応答が 503/);
  assert.deepEqual(calls.applyResult, []);
  assert.equal(r.ok, false);
});

test('一覧にデータがない：parseScheduleList の理由を記録する', async () => {
  const { db, calls } = makeDb();
  const io = makeIo(() => '<html></html>');
  const r = await runSyncResults({ db, fetchText: io.fetchText, sleep: io.sleep, nowMs: NOW, clubId: 'matsumoto' });
  assert.equal(r.ok, false);
  assert.equal(r.list_read, 1);
  assert.match(finalRow(calls).message, /一覧ページに試合のデータが見つかりません/);
  assert.deepEqual(calls.applyResult, []);
});

test('試合ページの取得が投げる：得点者は null（失敗の印）、取り込み全体は ok', async () => {
  const { db, calls } = makeDb();
  const io = makeIo((url) => (url === listUrl ? LIST : new Error('Jリーグ公式の応答が 500')));
  await runSyncResults({ db, fetchText: io.fetchText, sleep: io.sleep, nowMs: NOW, clubId: 'matsumoto' });
  assert.deepEqual(calls.applyScorers, [['f1', null]]);
  assert.equal(recordCount(calls), 1);
  assert.equal(finalRow(calls).ok, true);
  assert.equal(finalRow(calls).pages_read, 1);
  assert.match(finalRow(calls).message, /f1/);
});

test('試合ページの得点者の数が合わない：得点者は null', async () => {
  const { db, calls } = makeDb();
  const io = makeIo((url) => (url === listUrl ? LIST : BROKEN));
  await runSyncResults({ db, fetchText: io.fetchText, sleep: io.sleep, nowMs: NOW, clubId: 'matsumoto' });
  assert.deepEqual(calls.applyScorers, [['f1', null]]);
  assert.match(finalRow(calls).message, /得点者を取り込めなかった試合：f1/);
});

test('applyResult が false（読んでいる間に手で直された）：message に書き換えなかった試合', async () => {
  const { db, calls } = makeDb({ applyResult: async () => false });
  const io = makeIo(pageOk);
  await runSyncResults({ db, fetchText: io.fetchText, sleep: io.sleep, nowMs: NOW, clubId: 'matsumoto' });
  assert.match(finalRow(calls).message, /書き換えなかった試合（手入力など）：f1/);
});

test('insertRun 以外で例外：それでも記録は1回、ok は false', async () => {
  const { db, calls } = makeDb({ fixturesOf: async () => { throw new Error('DB が落ちた'); } });
  const io = makeIo(pageOk);
  const r = await runSyncResults({ db, fetchText: io.fetchText, sleep: io.sleep, nowMs: NOW, clubId: 'matsumoto' });
  assert.equal(recordCount(calls), 1);
  assert.equal(finalRow(calls).ok, false);
  assert.match(finalRow(calls).message, /DB が落ちた/);
  assert.equal(r.ok, false);
});

test('クラブに jleague_url がない：一覧を読まずに失敗', async () => {
  const { db, calls } = makeDb({ club: async () => ({ id: 'matsumoto', jleague_url: null }) });
  const io = makeIo(pageOk);
  const r = await runSyncResults({ db, fetchText: io.fetchText, sleep: io.sleep, nowMs: NOW, clubId: 'matsumoto' });
  assert.deepEqual(io.urls, []);
  assert.equal(r.ok, false);
  assert.equal(r.list_read, 0);
  assert.equal(recordCount(calls), 1);
});

test('今のシーズンの season_clubs にない：一覧を読まずに失敗', async () => {
  const { db, calls } = makeDb({ competitionOf: async () => null });
  const io = makeIo(pageOk);
  const r = await runSyncResults({ db, fetchText: io.fetchText, sleep: io.sleep, nowMs: NOW, clubId: 'matsumoto' });
  assert.deepEqual(io.urls, []);
  assert.equal(r.ok, false);
  assert.equal(r.list_read, 0);
  assert.equal(recordCount(calls), 1);
});

test('同時の2回：2回目は予約できず、何も読まずに実行中として記録する', async () => {
  let n = 0;
  const { db, calls } = makeDb({ reserveRun: async () => (n++ === 0 ? { runId: 7, pagesAllowed: 5 } : null), skipReason: async () => 'running' });
  const io1 = makeIo(pageOk);
  const io2 = makeIo(pageOk);
  await runSyncResults({ db, fetchText: io1.fetchText, sleep: io1.sleep, nowMs: NOW, clubId: 'matsumoto' });
  const r2 = await runSyncResults({ db, fetchText: io2.fetchText, sleep: io2.sleep, nowMs: NOW, clubId: 'matsumoto' });
  assert.deepEqual(io2.urls, []);
  assert.equal(r2.ok, false);
  assert.match(r2.message, /実行中/);
  assert.equal(calls.insertRun[0].skipped_reason, 'running');
  assert.equal(calls.finishRun.length, 1);
  assert.equal(calls.insertRun.length, 1);
  assert.equal(calls.insertRun[0].list_read, 0);
});

test('pagesAllowed が 0：一覧は読むが試合ページは読まない', async () => {
  const { db, calls } = makeDb({ reserveRun: async () => ({ runId: 7, pagesAllowed: 0 }) });
  const io = makeIo(pageOk);
  const r = await runSyncResults({ db, fetchText: io.fetchText, sleep: io.sleep, nowMs: NOW, clubId: 'matsumoto' });
  assert.deepEqual(io.urls, [listUrl]);
  assert.deepEqual(calls.applyScorers, []);
  assert.equal(r.pages_read, 0);
  assert.equal(calls.finishRun[0][1].list_read, 1);
});

test('applyResult が false の試合は試合ページを読まず、notApplied は1回だけ', async () => {
  const { db, calls } = makeDb({ applyResult: async () => false });
  const io = makeIo(pageOk);
  const r = await runSyncResults({ db, fetchText: io.fetchText, sleep: io.sleep, nowMs: NOW, clubId: 'matsumoto' });
  assert.deepEqual(io.urls, [listUrl]);
  assert.deepEqual(calls.applyScorers, []);
  assert.equal(r.message.match(/f1/g).length, 1);
});

test('applyScorers が投げる（DB のエラー）：null の印は付けず、ok は false', async () => {
  const seen = [];
  const { db, calls } = makeDb({ applyScorers: async (id, scorers) => { seen.push([id, scorers]); throw new Error('DB エラー'); } });
  const io = makeIo(pageOk);
  const r = await runSyncResults({ db, fetchText: io.fetchText, sleep: io.sleep, nowMs: NOW, clubId: 'matsumoto' });
  assert.equal(seen.length, 1);
  assert.notEqual(seen[0][1], null);
  assert.equal(r.ok, false);
  assert.match(r.message, /DB エラー/);
  assert.equal(calls.finishRun.length, 1);
});

test('例外のとき finishRun に list_read: 1 が渡る。Error 以外の値でも理由が残る', async () => {
  const { db, calls } = makeDb({ fixturesOf: async () => { throw 'ただの文字列'; } });
  const io = makeIo(pageOk);
  const r = await runSyncResults({ db, fetchText: io.fetchText, sleep: io.sleep, nowMs: NOW, clubId: 'matsumoto' });
  assert.equal(calls.finishRun[0][0], 7);
  assert.equal(calls.finishRun[0][1].list_read, 1);
  assert.equal(r.ok, false);
  assert.match(r.message, /ただの文字列/);
});
