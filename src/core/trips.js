// 遠征予定の日付と状態（設計書 5.2.1）。日付は 'YYYY-MM-DD'。

import { addDays } from './time.js';
import { lodgingDates } from './lodging.js';

// 試合に紐づく遠征予定は試合日、試合なしの遠征予定は custom_date
export function tripDate(trip, fixturesById) {
  if (trip.fixture_id != null) return fixturesById[trip.fixture_id].match_date;
  return trip.custom_date;
}

// 試合当日はまだ「これから」。翌日から過去
export function isTripPast(trip, fixturesById, today) {
  return tripDate(trip, fixturesById) < today;
}

// これからの遠征予定を日付の早い順に
export function upcomingTrips(trips, fixturesById, today) {
  return trips
    .filter((t) => !isTripPast(t, fixturesById, today))
    .sort((a, b) => {
      const da = tripDate(a, fixturesById);
      const db = tripDate(b, fixturesById);
      return da < db ? -1 : da > db ? 1 : 0;
    });
}

// カレンダーに帯を出す日：当日と、宿泊に応じて前日・翌日
export function tripStayDates(trip, fixturesById) {
  const date = tripDate(trip, fixturesById);
  const stay = lodgingDates(date, trip.lodging ?? 'none');
  if (!stay) return [date];
  const dates = [];
  for (let d = stay.checkIn; d <= stay.checkOut; d = addDays(d, 1)) dates.push(d);
  return dates;
}
