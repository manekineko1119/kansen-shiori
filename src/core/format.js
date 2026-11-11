// 表示用の整形（日付・あと◯日・円・分）。日付は 'YYYY-MM-DD'（日本時間）。端末のタイムゾーンは使わない

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

function parts(date) {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d, w: WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] };
}

// '10/25（日）'
export function formatDateJa(date) {
  const { m, d, w } = parts(date);
  return `${m}/${d}（${w}）`;
}

// '2026/10/25（日）'
export function formatDateLong(date) {
  const { y, m, d, w } = parts(date);
  return `${y}/${m}/${d}（${w}）`;
}

// date が today の何日後か（過ぎていれば負）
export function daysUntil(date, today) {
  const a = parts(date);
  const b = parts(today);
  return Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)) / 86400000);
}

export function formatYen(n) {
  return n == null ? '－' : `${n.toLocaleString('en-US')}円`;
}

export function minutesText(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}分`;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}
