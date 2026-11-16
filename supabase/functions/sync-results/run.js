// 試合結果の取り込みの本体（設計書 6.2、D14）。
// 通信・DB・待ち時間・現在時刻は引数で受け取る（Deno・fetch・Date.now() を使わない）。
import { ACCESS_LIMITS, BACKFILL_LIMITS, planSync, scheduleListUrl, formatResultsMessage } from '../_shared/sync-plan.js';
import { parseScheduleList, parseMatchPage, buildScorers, clubSlugFromUrl } from '../_shared/jleague-parse.js';
import { jstDayStartIso, jstToday, isClubId } from '../_shared/edge-auth.js';

// 一覧を読まなかった回の理由と、sync_runs.message（設計書 3.4・6.2、D37）
const SKIP_MESSAGES = {
  limit: '今日の一覧ページを読む回数の上限に達しているため、読みませんでした',
  running: '実行中のため読みません',
};

// 試合ページを1つ読んで得点者を保存する。
// 取得・読み取り・buildScorers の失敗は得点者 null（失敗の印）にして理由を返す。DB のエラーは投げたままにする（その実行が ok: false になる）
async function importScorers({ db, fetchText, sleep, counts, target, fixture }) {
  let scorers = null;
  let failure = null;
  try {
    await sleep(ACCESS_LIMITS.intervalMs);
    counts.pagesRead += 1; // 読もうとした回数（読んだ後に失敗しても数える）
    const page = parseMatchPage(await fetchText(target.url));
    const built = buildScorers(page, { homeClubId: fixture.home_club_id, awayClubId: fixture.away_club_id });
    failure = page.reason ?? built.reason ?? null;
    if (!failure) scorers = built.scorers;
  } catch (e) {
    failure = String(e?.message ?? e);
  }
  const applied = await db.applyScorers(target.fixtureId, scorers);
  return failure ? { failure } : { applied };
}

async function sync({ db, fetchText, sleep, nowMs, clubId, backfill }, state, report) {
  const { counts } = state;
  if (!isClubId(clubId)) {
    report.error = 'club_id の形が正しくありません';
    return;
  }
  const season = await db.currentSeason();
  const club = await db.club(clubId);
  const clubSlug = clubSlugFromUrl(club?.jleague_url);
  const competition = season && club ? await db.competitionOf(season.id, clubId) : null;
  if (!season || !clubSlug || !competition) {
    report.error = '取り込めません：今のシーズン・クラブの Jリーグ公式の URL・大会のどれかが見つかりません';
    return;
  }
  // 読む前に回数を予約する（同時に走っても1日の上限を超えない。D21）。
  // 別の実行が10分以内に始まって終わっていなければ予約できない（実行を1つずつにする）
  const reserved = await db.reserveRun({
    dayStartIso: jstDayStartIso(nowMs),
    listLimit: ACCESS_LIMITS.listPerDay,
    pagesLimit: ACCESS_LIMITS.matchPagesPerDay + (backfill ? BACKFILL_LIMITS.matchPagesPerRun : 0),
    pagesPerRun: backfill ? BACKFILL_LIMITS.matchPagesPerRun : ACCESS_LIMITS.matchPagesPerRun,
  });
  if (!reserved) {
    // 予約が0行：上限か実行中か。分からない値は limit にする（check 制約に当たらないように）
    const reason = await db.skipReason();
    state.skippedReason = reason === 'running' ? 'running' : 'limit';
    return;
  }
  state.runId = reserved.runId;
  counts.listRead += 1;
  const list = parseScheduleList(await fetchText(scheduleListUrl({ competition, clubSlug, startDate: season.starts_on, endDate: jstToday(nowMs) })));
  if (list.reason) {
    report.error = list.reason;
    return;
  }
  report.skipped = list.skipped ?? 0;
  const fixtures = await db.fixturesOf(season.id, clubId);
  const plan = planSync({ items: list.items, fixtures, clubs: await db.clubs(), quota: { list: 1, matchPages: reserved.pagesAllowed }, perRun: backfill ? BACKFILL_LIMITS.matchPagesPerRun : ACCESS_LIMITS.matchPagesPerRun });
  Object.assign(report, { unmatched: plan.unmatched, duplicates: plan.duplicates, unknownStates: plan.unknownStates });
  const notApplied = new Set();
  for (const u of plan.updates) {
    // 手で直された試合は、試合ページも読まない。false は「manual で拒否」と「変更なし」の両方だが、
    // planSync は DB と違う列だけを patch にするので、変更なしは読んでから書くまでに別の実行が同じ値を
    // 書いたときだけ。その回は飛ばしても、次の実行では patch が空になり試合ページを読む（Codex の指摘、2026-11-10）
    if (!(await db.applyResult(u.id, u.patch))) notApplied.add(u.id);
  }
  const byId = new Map(fixtures.map((f) => [f.id, f]));
  for (const t of plan.matchPagesToRead) {
    if (notApplied.has(t.fixtureId)) continue;
    const r = await importScorers({ db, fetchText, sleep, counts, target: t, fixture: byId.get(t.fixtureId) });
    if (r.failure) report.scorerFailures.push({ fixtureId: t.fixtureId, reason: r.failure });
    else if (r.applied === false) notApplied.add(t.fixtureId);
  }
  report.notApplied = [...notApplied];
}

// 一度だけの取り込みの回は、message の先頭にそう書く（管理画面の記録で見分けるため）
function withBackfillNote(once, message) {
  if (!once) return message;
  const note = `一度だけの取り込み（試合ページは最大${BACKFILL_LIMITS.matchPagesPerRun}件）`;
  return message ? `${note}\n${message}` : note;
}

// 戻り値：{ ok, message, list_read, pages_read, skipped_reason }。最後に必ず sync_runs を1行にする
// （予約できていれば finishRun、できていなければ insertRun。上限・実行中で読まなかった回は skipped_reason を入れる）
// backfill：true のときだけ一度だけの取り込み（設計書 6.2）。true 以外の値は、ふだんの取り込み
export async function runSyncResults({ db, fetchText, sleep, nowMs, clubId, backfill }) {
  const once = backfill === true;
  const state = { runId: null, skippedReason: null, counts: { listRead: 0, pagesRead: 0 } };
  const report = { unmatched: [], duplicates: [], unknownStates: [], skipped: 0, scorerFailures: [], notApplied: [], error: null };
  try {
    await sync({ db, fetchText, sleep, nowMs, clubId, backfill: once }, state, report);
  } catch (e) {
    report.error = String(e?.message ?? e);
  }
  const skipped = report.error === null ? state.skippedReason : null;
  const result = {
    ok: report.error === null && skipped === null,
    message: withBackfillNote(once, skipped ? SKIP_MESSAGES[skipped] : formatResultsMessage(report)),
    list_read: state.counts.listRead,
    pages_read: state.counts.pagesRead,
    skipped_reason: skipped,
  };
  if (state.runId === null) await db.insertRun({ job: 'results', ...result });
  else await db.finishRun(state.runId, result);
  return result;
}
