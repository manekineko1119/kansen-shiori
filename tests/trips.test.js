import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tripDate, isTripPast, upcomingTrips, tripStayDates } from '../src/core/trips.js';

const fxById = { f1: { id: 'f1', match_date: '2026-11-21' }, f2: { id: 'f2', match_date: '2026-12-01' } };

test('tripDate: 試合があれば試合日、なければ custom_date', () => {
  assert.equal(tripDate({ fixture_id: 'f1' }, fxById), '2026-11-21');
  assert.equal(tripDate({ fixture_id: null, custom_date: '2026-11-10' }, fxById), '2026-11-10');
});

test('isTripPast: 試合当日はこれから、翌日から過去', () => {
  assert.equal(isTripPast({ fixture_id: 'f1' }, fxById, '2026-11-21'), false);
  assert.equal(isTripPast({ fixture_id: 'f1' }, fxById, '2026-11-22'), true);
  assert.equal(isTripPast({ fixture_id: null, custom_date: '2026-11-10' }, fxById, '2026-11-11'), true);
});

test('upcomingTrips: 過去を除き日付の早い順', () => {
  const trips = [
    { id: 'a', fixture_id: 'f2' },
    { id: 'b', fixture_id: null, custom_date: '2026-11-05' },
    { id: 'c', fixture_id: 'f1' },
  ];
  assert.deepEqual(upcomingTrips(trips, fxById, '2026-11-10').map((t) => t.id), ['c', 'a']);
  assert.deepEqual(upcomingTrips(trips, fxById, '2026-11-01').map((t) => t.id), ['b', 'c', 'a']);
});

test('tripStayDates: 宿泊の区分ごとの帯の日', () => {
  assert.deepEqual(tripStayDates({ fixture_id: 'f1', lodging: 'both' }, fxById), ['2026-11-20', '2026-11-21', '2026-11-22']);
  assert.deepEqual(tripStayDates({ fixture_id: 'f1', lodging: 'pre' }, fxById), ['2026-11-20', '2026-11-21']);
  assert.deepEqual(tripStayDates({ fixture_id: 'f1', lodging: 'post' }, fxById), ['2026-11-21', '2026-11-22']);
  assert.deepEqual(tripStayDates({ fixture_id: 'f1', lodging: 'none' }, fxById), ['2026-11-21']);
  assert.deepEqual(tripStayDates({ fixture_id: 'f2', lodging: 'both' }, fxById), ['2026-11-30', '2026-12-01', '2026-12-02']);
});

test('試合がスナップショットにない遠征予定：日付は null・過去扱いで、これからの一覧と帯には出ない', () => {
  const trip = { id: 'x', fixture_id: 'old-season-fixture', lodging: 'both' };
  assert.equal(tripDate(trip, fxById), null);
  assert.equal(isTripPast(trip, fxById, '2026-11-01'), true);
  assert.deepEqual(tripStayDates(trip, fxById), []);
  assert.deepEqual(upcomingTrips([trip], fxById, '2026-11-01'), []);
});
