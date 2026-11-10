// 試合結果の取り込みの本体（設計書 6.2、D14）。
// 通信・DB・待ち時間・現在時刻は引数で受け取る（Deno・fetch・Date.now() を使わない）。
import { ACCESS_LIMITS, remainingQuota, planSync, scheduleListUrl, formatResultsMessage } from '../_shared/sync-plan.js';
import { parseScheduleList, parseMatchPage, buildScorers, clubSlugFromUrl } from '../_shared/jleague-parse.js';
import { jstDayStartIso, jstToday } from '../_shared/edge-auth.js';

// 試合ページを1つ読んで得点者を保存する。失敗は得点者 null（失敗の印）にして理由を返す
async function importScorers({ db, fetchText, sleep, counts, target, fixture }) {
  try {
    await sleep(ACCESS_LIMITS.intervalMs);
    counts.pagesRead += 1; // 読もうとした回数（読んだ後に失敗しても数える）
    const page = parseMatchPage(await fetchText(target.url));
    const built = buildScorers(page, { homeClubId: fixture.home_club_id, awayClubId: fixture.away_club_id });
    const reason = page.reason ?? built.reason;
    if (reason) return { failure: reason, applied: await db.applyScorers(target.fixtureId, null) };
    return { applied: await db.applyScorers(target.fixtureId, built.scorers) };
  } catch (e) {
    await db.applyScorers(target.fixtureId, null);
    return { failure: e.message };
  }
}

async function sync({ db, fetchText, sleep, nowMs, clubId }, counts, report) {
  const season = await db.currentSeason();
  const club = await db.club(clubId);
  const clubSlug = clubSlugFromUrl(club?.jleague_url);
  const competition = season && club ? await db.competitionOf(season.id, clubId) : null;
  if (!season || !clubSlug || !competition) {
    report.error = '取り込めません：今のシーズン・クラブの Jリーグ公式の URL・大会のどれかが見つかりません';
    return;
  }
  const quota = remainingQuota(await db.runsSince(jstDayStartIso(nowMs)));
  if (quota.list <= 0) {
    report.error = '今日の一覧ページを読む回数の上限に達しているため、読みませんでした';
    return;
  }
  counts.listRead += 1;
  const list = parseScheduleList(await fetchText(scheduleListUrl({ competition, clubSlug, startDate: season.starts_on, endDate: jstToday(nowMs) })));
  if (list.reason) {
    report.error = list.reason;
    return;
  }
  report.skipped = list.skipped ?? 0;
  const fixtures = await db.fixturesOf(season.id, clubId);
  const plan = planSync({ items: list.items, fixtures, clubs: await db.clubs(), quota });
  Object.assign(report, { unmatched: plan.unmatched, duplicates: plan.duplicates, unknownStates: plan.unknownStates });
  for (const u of plan.updates) {
    if (!(await db.applyResult(u.id, u.patch))) report.notApplied.push(u.id);
  }
  const byId = new Map(fixtures.map((f) => [f.id, f]));
  for (const t of plan.matchPagesToRead) {
    const r = await importScorers({ db, fetchText, sleep, counts, target: t, fixture: byId.get(t.fixtureId) });
    if (r.failure) report.scorerFailures.push({ fixtureId: t.fixtureId, reason: r.failure });
    if (r.applied === false && !r.failure) report.notApplied.push(t.fixtureId);
  }
}

// 戻り値：{ ok, message, list_read, pages_read }。最後に必ず sync_runs へ1行書く
export async function runSyncResults({ db, fetchText, sleep, nowMs, clubId }) {
  const counts = { listRead: 0, pagesRead: 0 };
  const report = { unmatched: [], duplicates: [], unknownStates: [], skipped: 0, scorerFailures: [], notApplied: [], error: null };
  try {
    await sync({ db, fetchText, sleep, nowMs, clubId }, counts, report);
  } catch (e) {
    report.error = e.message;
  }
  const result = { ok: report.error === null, message: formatResultsMessage(report), list_read: counts.listRead, pages_read: counts.pagesRead };
  await db.insertRun({ job: 'results', ...result });
  return result;
}
