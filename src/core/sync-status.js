// 管理画面の「取り込み」と「写真の使用量」の判断（設計書 3.4・6.2・9章、D30・D37）。純粋な関数。通信・現在時刻は持ち込まない
import { remainingQuota } from '../../supabase/functions/_shared/sync-plan.js';
import { jstNow, compareDateTime } from './time.js';
import { unresultedFixtures } from './fixtures.js';

// running のまま10分を過ぎた行は、止まった実行（次の予約のときに DB が「中断」にする。設計書 6.2）
export const ABORT_AFTER_MS = 10 * 60_000;
export const ABORT_MESSAGE = '中断しました（10分以内に終わりませんでした）';
// 定期の取り込みの時刻（日本時間。pg_cron の 0 22 * * * と 30 14 * * *。マイグレーション 10）
export const SCHEDULED_RUNS_JST = ['07:00', '23:30'];
// 写真の注意の目安（無料の 1GB の 80%。設計書 9章）
export const PHOTO_LIMIT_BYTES = 2 ** 30;
const PHOTO_WARN_RATIO = 0.8;

const DAY_MS = 24 * 3600_000;
const JST_OFFSET_MS = 9 * 3600_000;
const msOf = (run) => Date.parse(run.ran_at);

// 日本時間の今日の 0 時（ISO）。sync_runs を「今日の分」で読むときに使う
export function jstDayStartIso(nowMs) {
  return new Date(Math.floor((nowMs + JST_OFFSET_MS) / DAY_MS) * DAY_MS - JST_OFFSET_MS).toISOString();
}

function stateOf(run, nowMs) {
  if (run.running) return nowMs - msOf(run) > ABORT_AFTER_MS ? 'aborted' : 'running';
  if (run.skipped_reason) return 'skipped';
  if (run.ok) return 'ok';
  return run.message === ABORT_MESSAGE ? 'aborted' : 'failed';
}

// runs：job = 'results' の行（今日の分。最後の結果のために、昨日以前の最新の行が混じってもよい）
// matchPagesToday：今日、URL での登録（job = 'match'）で読んだ試合ページの数（残りの試合ページから引く）
// 戻り値：last（最新の行の状態）、remaining（今日の残り）、canRun（「今すぐ取り込む」を押せるか）、reason（押せない理由）
export function syncPanel(runs, nowMs, matchPagesToday = 0) {
  const dayStart = Date.parse(jstDayStartIso(nowMs));
  const today = runs.filter((r) => msOf(r) >= dayStart);
  const quota = remainingQuota([...today.map((r) => ({ ...r, job: 'results' })), { job: 'match', pages_read: matchPagesToday }]);
  const remaining = { list: quota.list, pages: quota.matchPages };

  const latest = runs.reduce((a, r) => (a === null || msOf(r) > msOf(a) ? r : a), null);
  let last = null;
  if (latest) {
    const state = stateOf(latest, nowMs);
    last = {
      ranAt: latest.ran_at,
      state,
      message: state === 'aborted' ? ABORT_MESSAGE : (latest.message ?? null),
      skippedReason: latest.skipped_reason ?? null,
    };
  }
  const running = runs.some((r) => r.running && stateOf(r, nowMs) === 'running');
  let reason = null;
  if (running) reason = '取り込みが実行中です';
  else if (remaining.list <= 0) reason = '今日の残りがありません';
  return { last, remaining, canRun: reason === null, reason };
}

// D37：今押すと、今日 23:30 の定期の取り込みが一覧を読めなくなるか（押す前に確かめる）
// 押したあとの残りが、今日これから動く定期の取り込みの数より少なければ、最後の 23:30 が読めない
export function pressSkipsEvening(runs, nowMs) {
  const panel = syncPanel(runs, nowMs);
  if (!panel.canRun) return false;
  const now = jstNow(nowMs);
  const evening = SCHEDULED_RUNS_JST.at(-1);
  if (compareDateTime(now, { date: now.date, time: evening }) >= 0) return false;
  const scheduledLeft = SCHEDULED_RUNS_JST.filter((time) => compareDateTime(now, { date: now.date, time }) < 0).length;
  return panel.remaining.list - 1 < scheduledLeft;
}

// 今季の終わった試合のうち、自動で取り込めた数（api）・手で入れた数（manual）・まだ入っていない数（missing。未入力一覧と同じ）
export function importCounts(fixtures, nowMs) {
  const finished = fixtures.filter((f) => f.status === 'finished');
  const api = finished.filter((f) => f.result_source === 'api').length;
  return { api, manual: finished.length - api, missing: unresultedFixtures(fixtures, nowMs).length };
}

// 写真の使用量：1GB の 80% 以上で 'warn'
export function photoUsageLevel(bytes) {
  return bytes >= PHOTO_LIMIT_BYTES * PHOTO_WARN_RATIO ? 'warn' : 'ok';
}
