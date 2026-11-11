import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCalendarQuery, shiftMonth, monthParam, calendarHref, dayEntries, bandTone } from '../src/core/calendar-view.js';
import { calendarItems } from '../src/core/calendar.js';
import { jstNow } from '../src/core/time.js';

test('parseCalendarQuery: m と d を読む', () => {
  assert.deepEqual(parseCalendarQuery('m=2026-11&d=2026-11-14', '2026-11-02'), { year: 2026, month: 11, day: '2026-11-14' });
  assert.deepEqual(parseCalendarQuery('m=2027-01', '2026-11-02'), { year: 2027, month: 1, day: null });
});

test('parseCalendarQuery: なければ今日の月、m がなく d だけなら d の月', () => {
  assert.deepEqual(parseCalendarQuery('', '2026-11-02'), { year: 2026, month: 11, day: null });
  assert.deepEqual(parseCalendarQuery(undefined, '2026-11-02'), { year: 2026, month: 11, day: null });
  assert.deepEqual(parseCalendarQuery('d=2026-12-05', '2026-11-02'), { year: 2026, month: 12, day: '2026-12-05' });
});

test('parseCalendarQuery: 壊れた m・d は無視して今日の月', () => {
  assert.deepEqual(parseCalendarQuery('m=2026-13&d=2026-02-30', '2026-11-02'), { year: 2026, month: 11, day: null });
  assert.deepEqual(parseCalendarQuery('m=abc&d=xyz', '2026-11-02'), { year: 2026, month: 11, day: null });
  assert.deepEqual(parseCalendarQuery('m=2026-00', '2026-11-02'), { year: 2026, month: 11, day: null });
  assert.deepEqual(parseCalendarQuery('m=2026-1&d=2026-11-1', '2026-11-02'), { year: 2026, month: 11, day: null });
});

test('parseCalendarQuery: 日本時間 0:30 の today（UTC では前日）の月を使う', () => {
  // 2026-11-30 15:30 UTC = 日本時間 12/1 0:30
  const today = jstNow(Date.UTC(2026, 10, 30, 15, 30)).date;
  assert.equal(today, '2026-12-01');
  assert.deepEqual(parseCalendarQuery('', today), { year: 2026, month: 12, day: null });
});

test('shiftMonth: 年またぎ', () => {
  assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
  assert.deepEqual(shiftMonth(2027, 1, -1), { year: 2026, month: 12 });
  assert.deepEqual(shiftMonth(2026, 11, 1), { year: 2026, month: 12 });
  assert.deepEqual(shiftMonth(2026, 3, -3), { year: 2025, month: 12 });
});

test('monthParam・calendarHref', () => {
  assert.equal(monthParam(2026, 3), '2026-03');
  assert.equal(calendarHref(2026, 11), '#/calendar?m=2026-11');
  assert.equal(calendarHref(2026, 11, '2026-11-14'), '#/calendar?m=2026-11&d=2026-11-14');
});

const club = (id, short) => ({ id, name: id, short_name: short });
const fx = [
  { id: 'f-oct31', match_date: '2026-10-31', kickoff: '14:00', competition: 'J3', round: 12, home_club_id: 'gifu', away_club_id: 'matsumoto', status: 'finished', home_score: 1, away_score: 3 },
  { id: 'f-nov8', match_date: '2026-11-08', kickoff: null, competition: 'J3', round: 13, home_club_id: 'matsumoto', away_club_id: 'nara', status: 'scheduled' },
];
const env = {
  fixturesById: Object.fromEntries(fx.map((f) => [f.id, f])),
  clubsById: { gifu: club('gifu', '岐阜'), nara: club('nara', '奈良'), matsumoto: club('matsumoto', '山雅') },
  tripsById: { t1: { id: 't1', title: '岐阜遠征' } },
  supportClubId: 'matsumoto',
};
const items = calendarItems({
  fixtures: fx, supportClubId: 'matsumoto', fixturesById: env.fixturesById, today: '2026-10-30',
  trips: [{ id: 't1', fixture_id: 'f-oct31', lodging: 'post' }],
  records: [{ fixture_id: 'f-oct31', watch_style: 'stadium' }],
});

test('dayEntries: 月またぎの遠征予定（10/31 の後泊）が 11/1 にも出て、行き先は #/trips/<id>', () => {
  assert.deepEqual(dayEntries(items, '2026-11-01', env).map((e) => [e.type, e.label, e.href]),
    [['trip', '岐阜遠征', '#/trips/t1']]);
});

test('dayEntries: 終わった試合 → 記録、記録 → 記録、遠征予定 → 遠征', () => {
  const e = dayEntries(items, '2026-10-31', env);
  assert.deepEqual(e.map((x) => [x.type, x.label, x.href]), [
    ['result', '○ A 岐阜 3-1', '#/records/f-oct31'],
    ['record', '観戦記録', '#/records/f-oct31'],
    ['trip', '岐阜遠征', '#/trips/t1'],
  ]);
  assert.equal(e[0].outcome, 'win');
  assert.equal(e[0].sub, '明治安田J3リーグ 第12節　14:00');
});

test('dayEntries: これからの試合 → #/fixtures?f=<id>。キックオフ未定', () => {
  const e = dayEntries(items, '2026-11-08', env);
  assert.deepEqual(e.map((x) => [x.type, x.label, x.href, x.sub]),
    [['fixture', 'H 奈良', '#/fixtures?f=f-nov8', '明治安田J3リーグ 第13節　キックオフ時刻未定']]);
});

test('dayEntries: 何もない日・items が空は空の配列。試合の ID に記号があっても href は組める', () => {
  assert.deepEqual(dayEntries(items, '2026-11-20', env), []);
  assert.deepEqual(dayEntries(new Map(), '2026-11-20', env), []);
  const m = new Map([['2026-11-20', [{ type: 'fixture', fixtureId: 'a b&c', homeAway: 'H' }]]]);
  assert.equal(dayEntries(m, '2026-11-20', env)[0].href, '#/fixtures?f=a%20b%26c');
});

test('dayEntries: 色のクラス（tone）と印（mark）', () => {
  assert.deepEqual(dayEntries(items, '2026-10-31', env).map((e) => [e.tone, e.mark]), [['win', '○'], ['rec', '⚑'], ['trip', '遠']]);
  assert.deepEqual(dayEntries(items, '2026-11-08', env).map((e) => [e.tone, e.mark]), [['h', 'H']]);
  assert.deepEqual([bandTone({ type: 'result', outcome: null }), bandTone({ type: 'fixture', homeAway: 'A' })], ['none', 'a']);
});
