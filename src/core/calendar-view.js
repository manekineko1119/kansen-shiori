// カレンダー画面の判断（月・日の選択、前後の月、選んだ日の一覧）。設計書 3.3・3.5、D30・D32
import { isValidDate } from './time.js';
import { OUTCOME_MARK } from './result.js';
import { bandLabel, competitionLabel, opponentOf } from './fixture-view.js';

const inRange = (s) => Number(s.slice(0, 4)) >= 2000 && Number(s.slice(0, 4)) <= 2099;
const pad = (n, w = 2) => String(n).padStart(w, '0');

export function monthParam(year, month) {
  return `${pad(year, 4)}-${pad(month)}`;
}

// ?m=YYYY-MM&d=YYYY-MM-DD を読む。年は 2000〜2099 だけ。読めない値は無視する（m は今日の月、d はなし）。
// m がないときだけ、読める d の月を出す。m が壊れているときは今日の月で、d はその月の日なら残す。day は 'YYYY-MM-DD' か null
export function parseCalendarQuery(query, today) {
  const params = new URLSearchParams(query ?? '');
  const m = params.get('m') ?? '';
  const d = params.get('d') ?? '';
  const day = isValidDate(d) && inRange(d) ? d : null;
  const hit = /^(\d{4})-(\d{2})$/.exec(m);
  if (hit && inRange(m) && Number(hit[2]) >= 1 && Number(hit[2]) <= 12) return { year: Number(hit[1]), month: Number(hit[2]), day };
  const [ty, tm] = today.split('-').map(Number);
  if (m === '' && day) return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)), day };
  return { year: ty, month: tm, day: day && day.slice(0, 7) === today.slice(0, 7) ? day : null };
}

// 前の月・次の月（年をまたぐ）
export function shiftMonth(year, month, delta) {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

// 月・日の指定を URL にする（D32）
export function calendarHref(year, month, day = null) {
  return `#/calendar?m=${monthParam(year, month)}${day ? `&d=${day}` : ''}`;
}

// 帯・行の色のクラス名（CSS の .ev.<tone>・.res.<tone>）。fixture は a / h、result は勝敗（結果未登録は none）
export function bandTone(item) {
  if (item.type === 'result') return item.outcome ?? 'none';
  if (item.type === 'fixture') return item.homeAway === 'A' ? 'a' : 'h';
  return item.type === 'record' ? 'rec' : 'trip';
}

// 行頭の印（色だけに頼らない）
const MARK = { record: '⚑', trip: '遠' };
function bandMark(item) {
  if (item.type === 'result') return OUTCOME_MARK[item.outcome] ?? '－';
  return item.type === 'fixture' ? item.homeAway : MARK[item.type];
}

// 選んだ日の一覧の行。items は calendarItems の結果（日付 → 帯の一覧）。
// 行き先：終わった試合・観戦記録 → #/records/<id>、これからの試合 → #/fixtures?f=<id>、遠征予定 → #/trips/<id>
export function dayEntries(items, date, env) {
  return (items.get(date) ?? []).map((item) => ({ ...entryOf(item, env), tone: bandTone(item), mark: bandMark(item) }));
}

function entryOf(item, env) {
  const label = bandLabel(item, env).long;
  if (item.type === 'trip') return { type: 'trip', label, sub: '遠征予定', href: `#/trips/${encodeURIComponent(item.tripId)}` };
  const id = encodeURIComponent(item.fixtureId);
  const f = env.fixturesById?.[item.fixtureId];
  const opp = f ? opponentOf(f, env.supportClubId, env.clubsById).short_name : '';
  if (item.type === 'record') return { type: 'record', label, sub: opp ? `vs ${opp}` : '', href: `#/records/${id}` };
  const sub = f ? `${competitionLabel(f)}　${f.kickoff ?? 'キックオフ時刻未定'}` : '';
  if (item.type === 'result') return { type: 'result', outcome: item.outcome, label, sub, href: `#/records/${id}` };
  return { type: 'fixture', homeAway: item.homeAway, label, sub, href: `#/fixtures?f=${id}` };
}
