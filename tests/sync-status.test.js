import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  syncPanel, photoUsageLevel, pressSkipsEvening, jstDayStartIso, importCounts, ABORT_AFTER_MS,
} from '../src/core/sync-status.js';

const iso = (ms) => new Date(ms).toISOString();
// 日本時間の日時 → エポックミリ秒
const jst = (date, time) => {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return Date.UTC(y, m - 1, d, h, mi) - 9 * 3600_000;
};
const T = jst('2026-11-12', '15:00');

test('syncPanel：指示書の値', () => {
  assert.deepEqual(syncPanel([], T).remaining, { list: 2, pages: 10 });
  assert.equal(syncPanel([{ ran_at: iso(T - 60_000), running: true, list_read: 1, page_reads: 0 }], T).canRun, false);
  assert.equal(syncPanel([{ ran_at: iso(T - 60_000), running: true }], T).reason, '取り込みが実行中です');
  assert.equal(syncPanel([{ ran_at: iso(T - 11 * 60_000), running: true, list_read: 1, page_reads: 0 }], T).last.state, 'aborted');
  const full = [1, 2].map((i) => ({ ran_at: iso(T - i * 3600_000), running: false, ok: true, list_read: 1, page_reads: 0 }));
  assert.deepEqual([syncPanel(full, T).canRun, syncPanel(full, T).reason], [false, '今日の残りがありません']);
  assert.equal(photoUsageLevel(0.79 * 2 ** 30), 'ok');
  assert.equal(photoUsageLevel(0.8 * 2 ** 30), 'warn');
});

test('syncPanel：何もない日は last が null で押せる', () => {
  assert.deepEqual(syncPanel([], T), { last: null, remaining: { list: 2, pages: 10 }, canRun: true, reason: null });
});

test('syncPanel：最後の結果は ran_at の新しい行（並びに依存しない）', () => {
  const runs = [
    { ran_at: iso(T - 7 * 3600_000), running: false, ok: true, message: null, list_read: 1, pages_read: 2 },
    { ran_at: iso(T - 3600_000), running: false, ok: false, message: 'Jリーグ公式の応答が 503', list_read: 1, pages_read: 0 },
  ];
  assert.deepEqual(syncPanel(runs, T).last, { ranAt: runs[1].ran_at, state: 'failed', message: 'Jリーグ公式の応答が 503', skippedReason: null });
  assert.deepEqual(syncPanel(runs, T).remaining, { list: 0, pages: 8 });
  assert.equal(syncPanel([runs[0]], T).last.state, 'ok');
});

test('syncPanel：10分ちょうどまでは実行中、過ぎたら中断（ボタンは押せる）', () => {
  const at = (min) => [{ ran_at: iso(T - min * 60_000), running: true, ok: false, message: null, list_read: 1, pages_read: 5 }];
  assert.equal(ABORT_AFTER_MS, 10 * 60_000);
  assert.equal(syncPanel(at(10), T).last.state, 'running');
  const aborted = syncPanel(at(10.5), T);
  assert.deepEqual([aborted.last.state, aborted.canRun, aborted.reason], ['aborted', true, null]);
  assert.equal(aborted.last.message, '中断しました（10分以内に終わりませんでした）');
  assert.deepEqual(aborted.remaining, { list: 1, pages: 5 }); // 中断の行も予約の回数を数える
});

test('syncPanel：DB が中断にした行も aborted', () => {
  const runs = [{ ran_at: iso(T - 3600_000), running: false, ok: false, message: '中断しました（10分以内に終わりませんでした）', list_read: 1, pages_read: 5 }];
  assert.equal(syncPanel(runs, T).last.state, 'aborted');
});

test('syncPanel：上限・実行中で読まなかった回は skipped（理由つき）。回数は減らない', () => {
  const limit = [{ ran_at: iso(T - 60_000), running: false, ok: false, message: '今日の一覧ページを読む回数の上限に達しているため、読みませんでした', list_read: 0, pages_read: 0, skipped_reason: 'limit' }];
  assert.deepEqual(syncPanel(limit, T).last, { ranAt: limit[0].ran_at, state: 'skipped', message: limit[0].message, skippedReason: 'limit' });
  assert.deepEqual(syncPanel(limit, T).remaining, { list: 2, pages: 10 });
  const running = [{ ...limit[0], skipped_reason: 'running', message: '実行中のため読みません' }];
  assert.equal(syncPanel(running, T).last.skippedReason, 'running');
});

test('syncPanel：残りは日本時間の今日の行だけで数える（昨日の行は最後の結果にだけ使う）', () => {
  const t = jst('2026-11-13', '00:30');
  const runs = [{ ran_at: iso(jst('2026-11-12', '23:30')), running: false, ok: true, message: null, list_read: 1, pages_read: 3 }];
  const p = syncPanel(runs, t);
  assert.deepEqual([p.remaining, p.canRun, p.last.state], [{ list: 2, pages: 10 }, true, 'ok']);
  assert.deepEqual(syncPanel(runs, jst('2026-11-12', '23:59')).remaining, { list: 1, pages: 7 });
});

test('jstDayStartIso：日本時間の 0 時（UTC の前日 15:00）', () => {
  assert.equal(jstDayStartIso(jst('2026-11-12', '15:00')), '2026-11-11T15:00:00.000Z');
  assert.equal(jstDayStartIso(jst('2026-11-13', '00:00')), '2026-11-12T15:00:00.000Z');
  assert.equal(jstDayStartIso(jst('2026-11-12', '23:59')), '2026-11-11T15:00:00.000Z');
});

// D37：押すと今日 23:30 の定期の取り込みが一覧を読まなくなるか
const done = (n, date = '2026-11-12') => Array.from({ length: n }, (_, i) => ({ ran_at: iso(jst(date, '07:00') + i * 60_000), running: false, ok: true, list_read: 1, pages_read: 0 }));

test('pressSkipsEvening：7:00 のあと、残り1回なら 23:29 までは確かめる', () => {
  assert.equal(pressSkipsEvening(done(1), jst('2026-11-12', '12:00')), true);
  assert.equal(pressSkipsEvening(done(1), jst('2026-11-12', '23:29')), true);
});

test('pressSkipsEvening：23:30 を過ぎたら確かめない（今日の定期はもう動いた）', () => {
  assert.equal(pressSkipsEvening(done(1), jst('2026-11-12', '23:31')), false);
  assert.equal(pressSkipsEvening([], jst('2026-11-12', '23:31')), false);
});

test('pressSkipsEvening：7:00 のあと、残り2回（朝の取り込みが動かなかった日）なら確かめない', () => {
  assert.equal(pressSkipsEvening([], jst('2026-11-12', '12:00')), false);
});

test('pressSkipsEvening：日本時間の 0 時を過ぎると新しい日。7:00 より前に押すと、7:00 と 23:30 で残りが足りない', () => {
  // 0:01 に押す → 残り1回を 7:00 が使い、23:30 は読めない
  assert.equal(pressSkipsEvening(done(2, '2026-11-12'), jst('2026-11-13', '00:01')), true);
  // 前日の 23:59 は、その日の 23:30 を過ぎている
  assert.equal(pressSkipsEvening(done(1, '2026-11-12'), jst('2026-11-12', '23:59')), false);
  assert.equal(pressSkipsEvening([], jst('2026-11-13', '06:59')), true);
});

test('pressSkipsEvening：押せないとき（残りなし・実行中）は確かめない', () => {
  assert.equal(pressSkipsEvening(done(2), jst('2026-11-12', '12:00')), false);
  assert.equal(pressSkipsEvening([{ ran_at: iso(jst('2026-11-12', '11:59')), running: true, list_read: 1, pages_read: 0 }], jst('2026-11-12', '12:00')), false);
});

test('importCounts：終わった試合のうち、自動・手入力・未入力の数（これからの試合・延期は数えない）', () => {
  const now = jst('2026-11-12', '15:00');
  const fx = [
    { id: 'a', match_date: '2026-11-01', kickoff: '14:00', status: 'finished', result_source: 'api' },
    { id: 'b', match_date: '2026-11-03', kickoff: '13:00', status: 'finished', result_source: 'manual' },
    { id: 'c', match_date: '2026-11-08', kickoff: null, status: 'scheduled', result_source: null },
    { id: 'd', match_date: '2026-11-12', kickoff: '14:00', status: 'scheduled', result_source: null }, // 終了の目安 16:00 の前
    { id: 'e', match_date: '2026-11-20', kickoff: '14:00', status: 'scheduled', result_source: null },
    { id: 'f', match_date: '2026-10-20', kickoff: '19:00', status: 'postponed', result_source: null },
  ];
  assert.deepEqual(importCounts(fx, now), { api: 1, manual: 1, missing: 1 });
  assert.deepEqual(importCounts([], now), { api: 0, manual: 0, missing: 0 });
});

test('syncPanel：今日の URL での登録（match）の試合ページ数だけ、残りの試合ページが減る（一覧は減らない）', () => {
  assert.deepEqual(syncPanel([], T, 3).remaining, { list: 2, pages: 7 });
  const runs = [{ ran_at: iso(T - 3600_000), running: false, ok: true, list_read: 1, pages_read: 2 }];
  assert.deepEqual(syncPanel(runs, T, 3).remaining, { list: 1, pages: 5 });
  assert.deepEqual(syncPanel(runs, T).remaining, { list: 1, pages: 8 });
});
