// 宿泊日と飛行機の往復の日付（設計書 5.2）。
// 日付は 'YYYY-MM-DD' の文字列で受け渡す。日付の計算は time.js の addDays を使う。

import { addDays } from './time.js';

export const LODGING = ['none', 'pre', 'post', 'both'];

// 区分ごとに、前泊か・後泊か
const NIGHTS_BEFORE = { none: false, pre: true, post: false, both: true };
const NIGHTS_AFTER = { none: false, pre: false, post: true, both: true };

function assertLodging(lodging) {
  if (!LODGING.includes(lodging)) {
    throw new Error(`未知の宿泊の区分です: ${lodging}`);
  }
}

// 宿泊の区分から、チェックイン・チェックアウト・泊数を決める。宿泊なし（none）は null
export function lodgingDates(matchDate, lodging) {
  assertLodging(lodging);
  if (lodging === 'none') return null;
  const checkIn = NIGHTS_BEFORE[lodging] ? addDays(matchDate, -1) : matchDate;
  const checkOut = NIGHTS_AFTER[lodging] ? addDays(matchDate, 1) : matchDate;
  const nights = (NIGHTS_BEFORE[lodging] ? 1 : 0) + (NIGHTS_AFTER[lodging] ? 1 : 0);
  return { checkIn, checkOut, nights };
}

// 飛行機の往路・復路の日付。前泊なら往路は前日、後泊なら復路は翌日
export function flightDates(matchDate, lodging) {
  assertLodging(lodging);
  const outbound = NIGHTS_BEFORE[lodging] ? addDays(matchDate, -1) : matchDate;
  const inbound = NIGHTS_AFTER[lodging] ? addDays(matchDate, 1) : matchDate;
  return { outbound, inbound };
}
