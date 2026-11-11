// カレンダー（#/calendar。設計書 3.3・3.5、FR-21・57〜57d）
// 月と選んだ日は URL（?m=・?d=）が持つ（D32）。S は縦に並べ、M・L は2列（CSS だけ）
import { el, innerLink } from '../components/parts.js';
import { monthGrid, calendarItems } from '../../core/calendar.js';
import { parseCalendarQuery, shiftMonth, calendarHref, dayEntries, bandTone } from '../../core/calendar-view.js';
import { bandLabel } from '../../core/fixture-view.js';
import { OUTCOME_MARK, recentForm } from '../../core/result.js';
import { formatDateJa } from '../../core/format.js';

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

function bandClass(item) {
  if (item.type === 'result') return item.outcome ?? 'none';
  if (item.type === 'fixture') return item.homeAway === 'A' ? 'a' : 'h';
  return item.type === 'record' ? 'rec' : 'trip';
}

function band(item, env) {
  const { short, long } = bandLabel(item, env);
  const mark = item.type === 'record' ? '⚑ ' : '';
  return el('span', { class: `ev ${bandTone(item)}` },
    el('span', { class: 'short' }, `${mark}${short}`), el('span', { class: 'long' }, `${mark}${long}`));
}

function cell(date, { year, month }, { items, today, selected, env }) {
  const [, m, d] = date.split('-').map(Number);
  const cls = ['cal-cell', m !== month ? 'out' : '', date === today ? 'today' : '', date === selected ? 'sel' : ''].filter(Boolean).join(' ');
  return el('td', null,
    el('a', { class: cls, href: calendarHref(year, month, date), 'aria-current': date === selected ? 'true' : null, 'aria-label': formatDateJa(date) },
      el('span', { class: 'd num' }, String(d)),
      (items.get(date) ?? []).map((item) => band(item, env))));
}

function head({ year, month }, form) {
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  return el('div', { class: 'cal-head' },
    el('a', { class: 'cal-nav', href: calendarHref(prev.year, prev.month), 'aria-label': '前の月' }, '‹'),
    // 年は上に小さく、月を大きく（シーズンが年をまたぐので年は必ず見せる）
    el('h2', { class: 'cal-title num', 'aria-label': `${year}年${month}月` },
      el('span', { class: 'cal-year' }, `${year}年`),
      el('span', { class: 'cal-month' }, String(month), el('small', null, '月'))),
    el('a', { class: 'cal-nav', href: calendarHref(next.year, next.month), 'aria-label': '次の月' }, '›'),
    el('div', { class: 'cal-form num', role: 'img', 'aria-label': form.length ? `直近${form.length}試合の結果` : '直近の結果なし' },
      el('span', null, '直近'),
      form.length ? form.map((o) => el('i', { class: `res ${o}` }, OUTCOME_MARK[o])) : el('em', null, 'なし')));
}

function dayPane(day, entries) {
  if (!day) return el('section', { class: 'sec cal-day' }, el('p', { class: 'muted' }, '日付を選ぶと、その日の試合・記録・遠征予定が出ます。'));
  return el('section', { class: 'sec cal-day' },
    el('h2', null, formatDateJa(day)),
    entries.length === 0
      ? el('p', { class: 'muted' }, 'この日の予定はありません。')
      : el('div', { class: 'cal-entries' }, entries.map((e) =>
        el('a', { class: 'cal-entry', href: e.href },
          el('span', { class: `res ${e.tone}` }, e.mark),
          el('span', { class: 't' }, el('b', null, e.label), e.sub ? el('span', null, e.sub) : null),
          el('span', { class: 'row-mark', 'aria-hidden': 'true' }, '›')))));
}

export function renderCalendar(ctx) {
  const { masters, settings, route, personal, today } = ctx;
  const club = settings?.support_club_id ?? null;
  const sel = parseCalendarQuery(route.query, today);
  const fixtures = (masters.data?.fixtures ?? []).concat(personal?.data?.extraFixtures ?? []);
  const trips = ctx.user ? (personal?.data?.trips ?? []) : [];
  const records = ctx.user ? (personal?.data?.records ?? []) : [];
  const env = {
    fixturesById: { ...masters.fixturesById, ...Object.fromEntries((personal?.data?.extraFixtures ?? []).map((f) => [f.id, f])) },
    clubsById: masters.clubsById,
    tripsById: Object.fromEntries(trips.map((t) => [t.id, t])),
    supportClubId: club,
  };
  const own = fixtures.filter((f) => f.home_club_id === club || f.away_club_id === club);
  const items = calendarItems({ fixtures: own, trips, records, supportClubId: club, fixturesById: env.fixturesById, today });
  const ctxCell = { items, today, selected: sel.day, env };

  const root = el('div', { class: 'calendar' });
  if (masters.status === 'unavailable') root.append(el('p', { class: 'note', role: 'status' }, masters.message));
  else if (masters.status === 'offline') root.append(el('p', { class: 'note', role: 'status' }, masters.label));

  const table = el('table', null,
    el('thead', null, el('tr', null, WEEK.map((w) => el('th', { scope: 'col' }, w)))),
    el('tbody', null, monthGrid(sel.year, sel.month).map((week) => el('tr', null, week.map((date) => cell(date, sel, ctxCell))))));
  const monthPane = el('div', null,
    el('section', { class: 'sec cal' }, head(sel, recentForm(own, club, today)), table),
    el('div', { class: 'cal-legend muted' },
      el('span', null, el('i', { class: 'res a' }, 'A'), ' アウェイ'), el('span', null, el('i', { class: 'res h' }, 'H'), ' ホーム'),
      el('span', null, el('i', { class: 'res trip' }, '遠'), ' 遠征予定'), el('span', null, el('i', { class: 'res rec' }, '⚑'), ' 観戦記録（現地）')),
    ctx.user ? null : innerLink({ href: '#/login', label: 'ログインすると遠征予定と観戦記録も表示されます' }));

  root.append(el('div', { class: 'cal-layout' }, monthPane, dayPane(sel.day, sel.day ? dayEntries(items, sel.day, env) : [])));
  return root;
}
