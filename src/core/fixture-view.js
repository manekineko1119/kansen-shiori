// 試合の見せ方の判断（H/A・相手・会場・大会名・帯の文字・得点者の左右）。設計書 3.3・4.4

// 応援クラブから見て H か A か。応援クラブが出ない試合は null
export function fixtureSide(f, supportClubId) {
  if (f.home_club_id === supportClubId) return 'H';
  if (f.away_club_id === supportClubId) return 'A';
  return null;
}

const unknownClub = (id) => ({ id, name: id, short_name: id });

// 応援クラブの相手。クラブの表になければ ID を名前にする
export function opponentOf(f, supportClubId, clubsById) {
  const id = f.home_club_id === supportClubId ? f.away_club_id : f.home_club_id;
  return clubsById?.[id] ?? unknownClub(id);
}

// 会場：venue_stadium_id → ホームのクラブの本拠地の順。名前は venue_name_override を優先
export function venueOf(f, { clubsById, stadiumsById }) {
  const id = f.venue_stadium_id ?? clubsById?.[f.home_club_id]?.home_stadium_id ?? null;
  const stadium = (id && stadiumsById?.[id]) || null;
  const name = f.venue_name_override || stadium?.name || '会場未定';
  return { stadium, name };
}

const COMPETITIONS = {
  J3: '明治安田J3リーグ', J2: '明治安田J2リーグ', J1: '明治安田J1リーグ',
  LEVAIN: 'ルヴァンカップ', EMPEROR: '天皇杯', FRIENDLY: 'トレーニングマッチ',
};

export function competitionLabel(f) {
  const name = COMPETITIONS[f.competition] ?? f.competition ?? '';
  if (f.round == null || f.round === '') return name;
  const round = /^\d+$/.test(String(f.round)) ? `第${f.round}節` : String(f.round);
  return `${name} ${round}`;
}

export function statusLabel(f) {
  if (f.status === 'finished') return f.home_score == null || f.away_score == null ? '結果未登録' : '試合終了';
  if (f.status === 'postponed') return '延期';
  if (f.status === 'cancelled') return '試合中止';
  return '';
}

const MARK = { win: '○', lose: '●', draw: '△' };

// 帯（カレンダー・一覧の小さな行）の文字。S は short、M・L は long を CSS で出し分ける
export function bandLabel(item, { fixturesById, clubsById, tripsById, supportClubId }) {
  if (item.type === 'record') return { short: '記録', long: '観戦記録' };
  if (item.type === 'trip') return { short: '遠征', long: tripsById?.[item.tripId]?.title ?? '遠征予定' };
  const f = fixturesById?.[item.fixtureId];
  const side = item.homeAway ?? (f ? fixtureSide(f, supportClubId) : null);
  const opp = f ? opponentOf(f, supportClubId, clubsById).short_name : '';
  const base = [side, opp].filter(Boolean).join(' ');
  if (item.type !== 'result') return { short: base, long: base };
  const mark = MARK[item.outcome];
  if (!mark || !f) return { short: base, long: `${base} 結果未登録` };
  const [mine, theirs] = side === 'A' ? [f.away_score, f.home_score] : [f.home_score, f.away_score];
  return { short: `${mark}${mine}-${theirs}`, long: `${mark} ${base} ${mine}-${theirs}` };
}

// 得点者を、得点が入ったクラブ（club_id）の側に分ける。並びは入っている順のまま
export function splitScorers(f) {
  const home = [];
  const away = [];
  for (const s of f.scorers ?? []) {
    const tag = s.type === 'penalty' ? '（PK）' : s.type === 'own_goal' ? '（OG）' : '';
    if (s.club_id === f.home_club_id) home.push(`${s.player} ${s.minute}'${tag}`);
    else away.push(`${s.minute}' ${s.player}${tag}`);
  }
  return { home, away };
}
