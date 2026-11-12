// 試合の並び順（日程・観戦記録・管理の日程で共通。設計書 3章、段6 のまとめのレビュー M-8）。純粋な関数だけ

// 日付 → キックオフ（未定は同じ日の最後）→ ID の昇順
export function compareFixtures(a, b) {
  if (a.match_date !== b.match_date) return a.match_date < b.match_date ? -1 : 1;
  const ka = a.kickoff ?? '99:99';
  const kb = b.kickoff ?? '99:99';
  if (ka !== kb) return ka < kb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// 新しい順：日付・キックオフは逆（未定は同じ日の先頭）。ID だけは昇順のまま
export function compareFixturesNewestFirst(a, b) {
  const byTime = compareFixtures({ ...a, id: '' }, { ...b, id: '' });
  if (byTime !== 0) return -byTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
