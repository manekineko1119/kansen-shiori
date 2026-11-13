// 応援クラブ目線の勝敗・スコア表記（設計書 5.6）。色は返さない（画面側で outcome をクラス名にする）

export const OUTCOME_MARK = { win: '○', lose: '●', draw: '△' };
export const OUTCOME_LABEL = { win: '勝ち', lose: '負け', draw: '引き分け' };

// 終わっていて、両方のスコアが入っている試合だけ「結果あり」
function hasResult(f) {
  return f.status === 'finished' && f.home_score != null && f.away_score != null;
}

// PK戦で決着がついている試合：終わっていて、同点で、両方の PK が整数で、PK の数が違う
export function isPkDecided(f) {
  return hasResult(f)
    && f.home_score === f.away_score
    && Number.isInteger(f.home_pk)
    && Number.isInteger(f.away_pk)
    && f.home_pk !== f.away_pk;
}

function scores(f, supportClubId) {
  if (!hasResult(f)) return null;
  const pk = isPkDecided(f);
  if (f.home_club_id === supportClubId) {
    return {
      own: f.home_score,
      opp: f.away_score,
      ownPk: pk ? f.home_pk : null,
      oppPk: pk ? f.away_pk : null,
    };
  }
  if (f.away_club_id === supportClubId) {
    return {
      own: f.away_score,
      opp: f.home_score,
      ownPk: pk ? f.away_pk : null,
      oppPk: pk ? f.home_pk : null,
    };
  }
  return null;
}

// ownScore / oppScore は 90 分（延長を含む）のスコアを返す。PK の数は含めない
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
  if (s.ownPk === null) return 'draw';
  return s.ownPk > s.oppPk ? 'win' : 'lose';
}

// 勝ち・負け・引き分け・PK勝ち・PK負け。終わっていない試合は null
export function outcomeLabel(f, supportClubId) {
  const s = scores(f, supportClubId);
  if (!s) return null;
  if (s.ownPk !== null) return s.ownPk > s.oppPk ? 'PK勝ち' : 'PK負け';
  return OUTCOME_LABEL[matchOutcome(f, supportClubId)];
}

// 応援クラブの得点を先に書く（例：'3-1'）。PK 戦は '3-3（PK 4-3）' のように PK も応援クラブが先
export function formatScore(f, supportClubId) {
  const s = scores(f, supportClubId);
  if (!s) return null;
  const base = `${s.own}-${s.opp}`;
  return s.ownPk === null ? base : `${base}（PK ${s.ownPk}-${s.oppPk}）`;
}

// today より前に終わった試合（スコア登録済み）を古い順に、最後の n 件
export function recentForm(fixtures, supportClubId, today, n = 5) {
  if (n <= 0) return [];
  return fixtures
    .filter((f) => f.match_date < today)
    .sort((a, b) => (a.match_date < b.match_date ? -1 : a.match_date > b.match_date ? 1 : 0))
    .map((f) => matchOutcome(f, supportClubId))
    .filter((o) => o !== null)
    .slice(-n);
}
