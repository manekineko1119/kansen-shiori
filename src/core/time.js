// 日本時間の日時の計算（設計書 5.1）。
// 'YYYY-MM-DD' と 'HH:MM' を「日本時間の時刻を UTC とみなしたミリ秒」に直して計算する。
// 端末のタイムゾーンは使わない。

const MIN_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MIN_MS;
const JST_OFFSET_MS = 9 * 60 * MIN_MS;

export const MATCH_DURATION_MIN = 120;

// 実在する 'YYYY-MM-DD' か（2027-02-30 などは false）
export function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

// {date, time} → 疑似UTCミリ秒
function toMs({ date, time }) {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return Date.UTC(y, mo - 1, d, h, mi);
}

// 疑似UTCミリ秒 → {date, time}
function fromMs(ms) {
  const iso = new Date(ms).toISOString(); // 'YYYY-MM-DDTHH:MM:SS.sssZ'
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

export function addDays(date, n) {
  return fromMs(toMs({ date, time: '00:00' }) + n * DAY_MS).date;
}

export function addMinutes(dt, minutes) {
  return fromMs(toMs(dt) + minutes * MIN_MS);
}

export function compareDateTime(a, b) {
  return Math.sign(toMs(a) - toMs(b));
}

// 現在時刻（エポックミリ秒）を日本時間の日時にする
export function jstNow(nowMs) {
  return fromMs(nowMs + JST_OFFSET_MS);
}

// b − a（分）
export function diffMinutes(a, b) {
  return (toMs(b) - toMs(a)) / MIN_MS;
}

// キックオフの arriveBeforeMin 分前。キックオフ未定なら null
export function arrivalTarget(date, kickoff, arriveBeforeMin) {
  if (kickoff == null) return null;
  return addMinutes({ date, time: kickoff }, -arriveBeforeMin);
}

// 試合終了の目安（キックオフ + 120分）。キックオフ未定なら null
export function matchEndEstimate(date, kickoff) {
  if (kickoff == null) return null;
  return addMinutes({ date, time: kickoff }, MATCH_DURATION_MIN);
}
