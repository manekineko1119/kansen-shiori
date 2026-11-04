// 応援クラブ目線の勝敗・スコア表記（設計書 5.6）。色は返さない（画面側で outcome をクラス名にする）

export const OUTCOME_MARK = { win: '○', lose: '●', draw: '△' };
export const OUTCOME_LABEL = { win: '勝ち', lose: '負け', draw: '引き分け' };

// 終わっていて、両方のスコアが入っている試合だけ「結果あり」
function hasResult(f) {
  return f.status === 'finished' && f.home_score != null && f.away_score != null;
}

function scores(f, supportClubId) {
  if (!hasResult(f)) return null;
  if (f.home_club_id === supportClubId) return { own: f.home_score, opp: f.away_score };
  if (f.away_club_id === supportClubId) return { own: f.away_score, opp: f.home_score };
  return null;
}

export function ownScore(f, supportClubId) {
  return scores(f, supportClubId)?.own ?? null;
}

export function oppScore(f, supportClubId) {
  return scores(f, supportClubId)?.opp ?? null;
}

export function matchOutcome(f, supportClubId) {
  const s = scores(f, supportClubId);
  if (!s) return null;
  if (s.own > s.opp) return 'win';
  if (s.own < s.opp) return 'lose';
  return 'draw';
}

// 応援クラブの得点を先に書く（例：'3-1'）
export function formatScore(f, supportClubId) {
  const s = scores(f, supportClubId);
  return s ? `${s.own}-${s.opp}` : null;
}

// today より前に終わった試合（スコア登録済み）を古い順に、最後の n 件
export function recentForm(fixtures, supportClubId, today, n = 5) {
  return fixtures
    .filter((f) => f.match_date < today)
    .sort((a, b) => (a.match_date < b.match_date ? -1 : a.match_date > b.match_date ? 1 : 0))
    .map((f) => matchOutcome(f, supportClubId))
    .filter((o) => o !== null)
    .slice(-n);
}
