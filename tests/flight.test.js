import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flightPlan, FLIGHT_WARNINGS, EARLIEST_LANDING, LATEST_RETURN } from '../src/core/flight.js';

const base = { matchDate: '2026-11-21', kickoff: '14:00', arriveBeforeMin: 90, arrivalAirport: { iata: 'OKA', access_min: 50 },
  originAirports: [{ code: 'NGO', name: '中部国際空港', access_min: 180 }, { code: 'MMJ', name: '信州まつもと空港', access_min: null }], checkinMin: 60, arrivalMin: 20 };

test('定数', () => {
  assert.equal(EARLIEST_LANDING, '06:00');
  assert.equal(LATEST_RETURN, '21:00');
  assert.equal(FLIGHT_WARNINGS.early, '当日の便では間に合わない可能性があります。前泊を検討してください');
  assert.equal(FLIGHT_WARNINGS.late, '当日の帰りの便がない可能性があります。後泊を検討してください');
});

test('宿なし：当日の着陸目標と帰りの出発目安・空港の所要時間', () => {
  const day = flightPlan({ ...base, lodging: 'none' });
  assert.deepEqual(day.landingTarget, { date: '2026-11-21', time: '11:20' });
  assert.deepEqual(day.returnDepartAfter, { date: '2026-11-21', time: '17:50' });
  assert.equal(day.landingNote, 'sameDay');
  assert.equal(day.returnNote, 'sameDay');
  assert.deepEqual(day.warnings, []);
  assert.deepEqual(day.airports[0], { code: 'NGO', name: '中部国際空港', leaveBeforeMin: 240, homeAfterMin: 200 });
  assert.deepEqual(day.airports[1], { code: 'MMJ', name: '信州まつもと空港', leaveBeforeMin: null, homeAfterMin: null });
});

test('前泊・後泊・両方', () => {
  const pre = flightPlan({ ...base, lodging: 'pre' });
  assert.equal(pre.landingTarget, null);
  assert.equal(pre.landingNote, 'prevDay');
  assert.equal(pre.returnNote, 'sameDay');
  assert.deepEqual(pre.returnDepartAfter, { date: '2026-11-21', time: '17:50' });
  const post = flightPlan({ ...base, lodging: 'post' });
  assert.equal(post.returnNote, 'nextDay');
  assert.equal(post.returnDepartAfter, null);
  assert.equal(post.landingNote, 'sameDay');
  const both = flightPlan({ ...base, lodging: 'both' });
  assert.equal(both.returnDepartAfter, null);
  assert.equal(both.landingTarget, null);
  assert.deepEqual(both.warnings, []);
});

test('キックオフ未定・空港なし・所要時間未登録', () => {
  const k = flightPlan({ ...base, lodging: 'none', kickoff: null });
  assert.equal(k.landingNote, 'kickoffUnknown');
  assert.equal(k.returnNote, 'kickoffUnknown');
  assert.equal(k.landingTarget, null);
  assert.deepEqual(k.warnings, []);
  const n = flightPlan({ ...base, lodging: 'none', arrivalAirport: null });
  assert.equal(n.landingNote, 'noAirport');
  assert.equal(n.returnNote, 'noAirport');
  const a = flightPlan({ ...base, lodging: 'none', arrivalAirport: { iata: 'OKA', access_min: null } });
  assert.equal(a.landingNote, 'accessUnknown');
  assert.equal(a.returnDepartAfter, null);
  // 前泊は空港なしより前泊の表示が優先
  assert.equal(flightPlan({ ...base, lodging: 'pre', arrivalAirport: null }).landingNote, 'prevDay');
  assert.equal(flightPlan({ ...base, lodging: 'post', kickoff: null }).returnNote, 'nextDay');
});

test('注意表示', () => {
  assert.deepEqual(flightPlan({ ...base, lodging: 'none', kickoff: '07:00' }).warnings, [FLIGHT_WARNINGS.early]); // 着陸目標 04:20
  assert.deepEqual(flightPlan({ ...base, lodging: 'none', kickoff: '19:30' }).warnings, [FLIGHT_WARNINGS.late]); // 21:30+50+60
  assert.deepEqual(flightPlan({ ...base, lodging: 'pre', kickoff: '07:00' }).warnings, []);
  assert.deepEqual(flightPlan({ ...base, lodging: 'post', kickoff: '19:30' }).warnings, []);
});

test('日付をまたぐ', () => {
  const p = flightPlan({ ...base, lodging: 'none', kickoff: '00:30' });
  assert.deepEqual(p.landingTarget, { date: '2026-11-20', time: '21:50' });
  assert.deepEqual(p.warnings, [FLIGHT_WARNINGS.early]);
  const late = flightPlan({ ...base, lodging: 'none', kickoff: '22:00' });
  assert.deepEqual(late.returnDepartAfter, { date: '2026-11-22', time: '01:50' });
  assert.deepEqual(late.warnings, [FLIGHT_WARNINGS.late]);
});
