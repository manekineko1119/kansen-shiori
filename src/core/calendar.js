// カレンダーの月表示と、日ごとの帯（設計書 3.3、FR-57c・57d）。

import { addDays } from './time.js';
import { matchOutcome } from './result.js';
import { isTripPast, tripStayDates } from './trips.js';

// 観戦記録の帯はスタジアム観戦のときだけ
export function shouldShowRecordBanner(record) {
  return record?.watch_style === 'stadium';
}

// 日曜はじまりの週ごとの日付。前後の月の日も埋める
export function monthGrid(year, month) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const start = addDays(first.toISOString().slice(0, 10), -first.getUTCDay());
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDay = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  const weeks = [];
  for (let d = start; d <= lastDay; d = addDays(d, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  }
  return weeks;
}

// 日付 → 帯の一覧。同じ日の順番は 試合・結果 → 観戦記録 → 遠征予定。
// 終わった遠征予定は出さない（FR-57d）
export function calendarItems({ fixtures, trips, records, supportClubId, fixturesById, today }) {
  const map = new Map();
  const add = (date, item) => {
    if (!map.has(date)) map.set(date, []);
    map.get(date).push(item);
  };

  for (const f of fixtures) {
    if (f.home_club_id !== supportClubId && f.away_club_id !== supportClubId) continue;
    const homeAway = f.home_club_id === supportClubId ? 'H' : 'A';
    if (f.status === 'finished') {
      add(f.match_date, { type: 'result', fixtureId: f.id, homeAway, outcome: matchOutcome(f, supportClubId) });
    } else {
      add(f.match_date, { type: 'fixture', fixtureId: f.id, homeAway });
    }
  }
  for (const r of records) {
    const f = fixturesById[r.fixture_id];
    if (f && shouldShowRecordBanner(r)) add(f.match_date, { type: 'record', fixtureId: r.fixture_id });
  }
  for (const t of trips) {
    if (isTripPast(t, fixturesById, today)) continue;
    for (const d of tripStayDates(t, fixturesById)) add(d, { type: 'trip', tripId: t.id });
  }
  return map;
}
