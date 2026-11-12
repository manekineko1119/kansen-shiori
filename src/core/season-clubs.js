// 管理画面のシーズンの所属（設計書 3.4・11.4）。クラブごとに「なし・J1・J2・J3」を選ぶ。
// 所属の表の主キーは (season_id, competition, club_id) なので、大会が変わるクラブは古い大会の行を消して新しい大会の行を足す

export const COMPETITIONS = ['J1', 'J2', 'J3'];
const rank = (c) => (COMPETITIONS.includes(c) ? COMPETITIONS.indexOf(c) : COMPETITIONS.length);

// rows（そのシーズンの season_clubs の行）→ Map（クラブ → 大会）。2つの大会に入っていたら J1 に近いほう
export function currentCompetitions(rows) {
  const out = new Map();
  for (const r of rows ?? []) {
    const had = out.get(r.club_id);
    if (had === undefined || rank(r.competition) < rank(had)) out.set(r.club_id, r.competition);
  }
  return out;
}

// want：{ クラブID: 'J1' | 'J2' | 'J3' | '' }（'' は所属なし）。want にないクラブの行は触らない
export function seasonClubDiff(rows, want) {
  const add = [];
  const drop = [];
  for (const [clubId, comp] of Object.entries(want)) {
    if (comp !== '' && !COMPETITIONS.includes(comp)) throw new Error(`選べない大会です: ${comp}`);
    const have = (rows ?? []).filter((r) => r.club_id === clubId);
    for (const r of have) if (r.competition !== comp) drop.push({ competition: r.competition, club_id: clubId });
    if (comp !== '' && !have.some((r) => r.competition === comp)) add.push({ competition: comp, club_id: clubId });
  }
  return { add, drop };
}

// 画面の見出し：今の所属の大会ごとに J1・J2・J3・所属なしの順。空の見出しは出さない
export function seasonClubSections(clubs, rows) {
  const current = currentCompetitions(rows);
  return [...COMPETITIONS, '']
    .map((competition) => ({
      competition,
      label: competition || '所属なし',
      clubs: (clubs ?? []).filter((c) => (COMPETITIONS.includes(current.get(c.id)) ? current.get(c.id) : '') === competition),
    }))
    .filter((s) => s.clubs.length > 0);
}
