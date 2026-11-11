// 日程の一覧の行の判断（応援クラブの試合だけ・日付順・H/A・相手・キックオフ・結果）。設計書 3章
import { fixtureSide, opponentOf, statusLabel } from './fixture-view.js';
import { matchOutcome, formatScore } from './result.js';

// 日付 → キックオフ（未定は最後）→ ID の順
function compare(a, b) {
  if (a.match_date !== b.match_date) return a.match_date < b.match_date ? -1 : 1;
  const ka = a.kickoff ?? '99:99';
  const kb = b.kickoff ?? '99:99';
  if (ka !== kb) return ka < kb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// mark：延期・試合中止・結果未登録の印（なければ ''）。outcome・score は結果があるときだけ
export function fixtureRows(fixtures, { supportClubId, clubsById }) {
  return (fixtures ?? [])
    .filter((f) => fixtureSide(f, supportClubId) !== null)
    .sort(compare)
    .map((f) => ({
      id: f.id,
      date: f.match_date,
      side: fixtureSide(f, supportClubId),
      opponent: opponentOf(f, supportClubId, clubsById).short_name,
      kickoff: f.kickoff ?? null,
      kickoffText: f.kickoff ?? '未定',
      finished: f.status === 'finished',
      outcome: matchOutcome(f, supportClubId),
      score: formatScore(f, supportClubId),
      mark: statusLabel(f) === '試合終了' ? '' : statusLabel(f),
    }));
}

// 今日（日本時間の日付）に近い行：今日以降で最初の行。全部過ぎていれば最後の行。空なら -1
export function nearestIndex(rows, today) {
  if (rows.length === 0) return -1;
  const i = rows.findIndex((r) => r.date >= today);
  return i === -1 ? rows.length - 1 : i;
}

// 今日に近い行へ動くか：0 より大きい位置が記録されていなければ動く（rerender は描き直しの前に 0 を記録するため、0 は「未記録」と同じに扱う）
export function shouldJumpToToday(savedScroll) {
  return !(savedScroll > 0);
}
