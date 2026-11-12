// 日程の判定（設計書 5.3・3.4）。現在時刻は nowMs（エポックミリ秒）で受け取る。
import { addDays, addMinutes, compareDateTime, jstNow, matchEndEstimate } from './time.js';

export const NEXT_MATCH_GRACE_MIN = 180;

const isActive = f => f.status !== 'postponed' && f.status !== 'cancelled';

// キックオフ（未定なら 00:00）での並び順
const byStart = (a, b) =>
  compareDateTime(
    { date: a.match_date, time: a.kickoff ?? '00:00' },
    { date: b.match_date, time: b.kickoff ?? '00:00' },
  );

// 試合終了の目安。キックオフ未定なら試合日の翌日0時
function endOf(f) {
  return matchEndEstimate(f.match_date, f.kickoff) ?? { date: addDays(f.match_date, 1), time: '00:00' };
}

// 次のアウェイ戦：キックオフ+3時間（未定は当日いっぱい）まで
export function nextAwayFixture(fixtures, supportClubId, nowMs) {
  const now = jstNow(nowMs);
  const list = fixtures
    .filter(f => f.away_club_id === supportClubId && isActive(f))
    .filter(f => {
      const limit = f.kickoff == null
        ? { date: addDays(f.match_date, 1), time: '00:00' }
        : addMinutes({ date: f.match_date, time: f.kickoff }, NEXT_MATCH_GRACE_MIN);
      return compareDateTime(now, limit) < 0;
    })
    .sort(byStart);
  return list[0] ?? null;
}

export function isResultOverdue(fixture, nowMs) {
  return compareDateTime(jstNow(nowMs), endOf(fixture)) >= 0;
}

export function unresultedFixtures(fixtures, nowMs) {
  return fixtures
    .filter(f => f.status === 'scheduled' && isResultOverdue(f, nowMs))
    .sort(byStart);
}

// キックオフ時刻が未定の、これからの試合の数（管理画面の日程。取り込み直しに気づくため）。today は 'YYYY-MM-DD'（日本時間）
export function pendingKickoffCount(fixtures, today) {
  return fixtures.filter(f => f.status === 'scheduled' && f.kickoff == null && f.match_date >= today).length;
}

// 記録をつける案内：試合終了の目安〜翌日いっぱい。複数なら新しい試合
export function recordPromptFixture(fixtures, supportClubId, nowMs) {
  const now = jstNow(nowMs);
  const list = fixtures
    .filter(f => (f.home_club_id === supportClubId || f.away_club_id === supportClubId) && isActive(f))
    .filter(f => {
      const until = { date: addDays(f.match_date, 2), time: '00:00' };
      return compareDateTime(now, endOf(f)) >= 0 && compareDateTime(now, until) < 0;
    })
    .sort(byStart);
  return list.at(-1) ?? null;
}
