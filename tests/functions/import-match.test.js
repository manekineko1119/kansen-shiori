import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runImportMatch } from '../../supabase/functions/import-match/run.js';
import { jstDayStartIso } from '../../supabase/functions/_shared/edge-auth.js';

const read = (name) => readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8');
const CUP = read('jleague-cup-post.html');
const LIST = read('jleague-list.html');
const NOW = Date.UTC(2026, 10, 9, 22, 0);
const CANON = 'https://www.jleague.jp/match/leaguecup/2026/090901/';

function makeDb(over = {}) {
  const calls = { reserveMatchPage: [], finishRun: [] };
  const db = {
    reserveMatchPage: async (args) => { calls.reserveMatchPage.push(args); return 7; },
    finishRun: async (id, row) => { calls.finishRun.push([id, row]); },
    ...over,
  };
  return { db, calls };
}

function makeIo(page) {
  const urls = [];
  return {
    urls,
    fetchText: async (url) => {
      urls.push(url);
      if (page instanceof Error) throw page;
      return page;
    },
  };
}

test('URL の形が違えば読まない', async () => {
  const { db, calls } = makeDb();
  const io = makeIo(CUP);
  const r = await runImportMatch({ db, fetchText: io.fetchText, nowMs: NOW, url: 'https://example.com/' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'url');
  assert.equal(calls.reserveMatchPage.length, 0);
  assert.equal(io.urls.length, 0);
});

test('上限なら読まない', async () => {
  const { db, calls } = makeDb({ reserveMatchPage: async () => null });
  const io = makeIo(CUP);
  const r = await runImportMatch({ db, fetchText: io.fetchText, nowMs: NOW, url: CANON });
  assert.equal(r.reason, 'limit');
  assert.match(r.message, /10件/);
  assert.equal(io.urls.length, 0);
  assert.equal(calls.finishRun.length, 0);
});

test('読めたら事実を返す', async () => {
  const { db, calls } = makeDb();
  const io = makeIo(CUP);
  const r = await runImportMatch({ db, fetchText: io.fetchText, nowMs: NOW, url: `${CANON}#summary` });
  assert.deepEqual(io.urls, [CANON]);
  assert.equal(r.ok, true);
  assert.equal(r.url, CANON);
  assert.equal(r.page.section, '1回戦');
  assert.equal(calls.finishRun.length, 1);
  const [id, row] = calls.finishRun[0];
  assert.equal(id, 7);
  assert.equal(row.ok, true);
  assert.equal(row.list_read, 0);
  assert.equal(row.pages_read, 1);
  assert.match(row.message, /\/match\/leaguecup\/2026\/090901\//);
});

test('読めなければ記録して失敗', async () => {
  const { db, calls } = makeDb();
  const io = makeIo(new Error('応答が 500'));
  const r = await runImportMatch({ db, fetchText: io.fetchText, nowMs: NOW, url: CANON });
  assert.equal(r.reason, 'fetch');
  assert.match(r.message, /応答が 500/);
  const row = calls.finishRun[0][1];
  assert.equal(row.ok, false);
  assert.equal(row.pages_read, 1);
});

test('形が違えば parse', async () => {
  const { db, calls } = makeDb();
  const io = makeIo(LIST);
  const r = await runImportMatch({ db, fetchText: io.fetchText, nowMs: NOW, url: CANON });
  assert.equal(r.reason, 'parse');
  assert.equal(calls.finishRun[0][1].ok, false);
});

test('reserveMatchPage に上限と日の始まりが渡る', async () => {
  const { db, calls } = makeDb();
  await runImportMatch({ db, fetchText: makeIo(CUP).fetchText, nowMs: NOW, url: CANON });
  assert.deepEqual(calls.reserveMatchPage, [{ dayStartIso: jstDayStartIso(NOW), pagesLimit: 10 }]);
});
