// 試合結果の取り込みの本体（設計書 6.2、D14）。
// 通信・DB・待ち時間・現在時刻は引数で受け取る（Deno・fetch・Date.now() を使わない）。
import { ACCESS_LIMITS, planSync, scheduleListUrl, formatResultsMessage } from '../_shared/sync-plan.js';
import { parseScheduleList, parseMatchPage, buildScorers, clubSlugFromUrl } from '../_shared/jleague-parse.js';
import { jstDayStartIso, jstToday } from '../_shared/edge-auth.js';

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

async function sync({ db, fetchText, sleep, nowMs, clubId }, state, report) {
  const { counts } = state;
  const season = await db.currentSeason();
  const club = await db.club(clubId);
  const clubSlug = clubSlugFromUrl(club?.jleague_url);
  const competition = season && club ? await db.competitionOf(season.id, clubId) : null;
  if (!season || !clubSlug || !competition) {
    report.error = '取り込めません：今のシーズン・クラブの Jリーグ公式の URL・大会のどれかが見つかりません';
    return;
  }
  // 読む前に回数を予約する（同時に走っても1日の上限を超えない。D21）
  const reserved = await db.reserveRun({
    dayStartIso: jstDayStartIso(nowMs),
    listLimit: ACCESS_LIMITS.listPerDay,
    pagesLimit: ACCESS_LIMITS.matchPagesPerDay,
    pagesPerRun: ACCESS_LIMITS.matchPagesPerRun,
  });
  if (!reserved) {
    report.error = '今日の一覧ページを読む回数の上限に達しているため、読みませんでした';
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
  const plan = planSync({ items: list.items, fixtures, clubs: await db.clubs(), quota: { list: 1, matchPages: reserved.pagesAllowed } });
  Object.assign(report, { unmatched: plan.unmatched, duplicates: plan.duplicates, unknownStates: plan.unknownStates });
  const notApplied = new Set();
  for (const u of plan.updates) {
    if (!(await db.applyResult(u.id, u.patch))) notApplied.add(u.id); // 手で直された試合は、試合ページも読まない
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

// 戻り値：{ ok, message, list_read, pages_read }。最後に必ず sync_runs を1行にする（予約できていれば finishRun、できていなければ insertRun）
export async function runSyncResults({ db, fetchText, sleep, nowMs, clubId }) {
  const state = { runId: null, counts: { listRead: 0, pagesRead: 0 } };
  const report = { unmatched: [], duplicates: [], unknownStates: [], skipped: 0, scorerFailures: [], notApplied: [], error: null };
  try {
    await sync({ db, fetchText, sleep, nowMs, clubId }, state, report);
  } catch (e) {
    report.error = String(e?.message ?? e);
  }
  const result = { ok: report.error === null, message: formatResultsMessage(report), list_read: state.counts.listRead, pages_read: state.counts.pagesRead };
  if (state.runId === null) await db.insertRun({ job: 'results', ...result });
  else await db.finishRun(state.runId, result);
  return result;
}
