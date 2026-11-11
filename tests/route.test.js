import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROUTES, parseRoute, buildHash, routeAccess } from '../src/core/route.js';

test('ROUTES は設計書 3章の表のとおり', () => {
  assert.deepEqual(ROUTES.map((r) => [r.name, r.path, r.access]), [
    ['search', '/search', 'public'],
    ['result', '/result', 'public'],
    ['fixtures', '/fixtures', 'public'],
    ['calendar', '/calendar', 'public'],
    ['trips', '/trips', 'user'],
    ['trip-new', '/trips/new', 'user'],
    ['trip', '/trips/:id', 'user'],
    ['records', '/records', 'user'],
    ['record', '/records/:fixtureId', 'public'],
    ['settings', '/settings', 'public'],
    ['login', '/login', 'public'],
    ['welcome', '/welcome', 'user'],
    ['admin', '/admin/:section?', 'admin'],
  ]);
});

test('parseRoute：パスとパラメータとクエリ', () => {
  assert.deepEqual(parseRoute('#/trips/abc-1'), { name: 'trip', params: { id: 'abc-1' }, query: '' });
  assert.deepEqual(parseRoute('#/result?f=2026-27_J3_26_matsumoto_nara&l=post'),
    { name: 'result', params: {}, query: 'f=2026-27_J3_26_matsumoto_nara&l=post' });
  assert.equal(parseRoute('#/records/2026-27_J3_26_matsumoto_nara').params.fixtureId, '2026-27_J3_26_matsumoto_nara');
  assert.equal(parseRoute('#/trips/%E3%81%82').params.id, 'あ');
  assert.deepEqual(parseRoute('#/admin/fixtures'), { name: 'admin', params: { section: 'fixtures' }, query: '' });
  assert.equal(parseRoute('#/admin').params.section, null);
});

test('parseRoute：知らないパス・空は search。こわれたエンコードでも投げない', () => {
  for (const h of ['', '#', '#/', '#/nope', '#/trips/a/b', 'abc']) assert.equal(parseRoute(h).name, 'search');
  assert.equal(parseRoute('#/trips/%E0%A4%A').name, 'search');
});

test('buildHash：組み立てと往復', () => {
  assert.equal(buildHash('trip', { id: 'a b' }), '#/trips/a%20b');
  assert.equal(buildHash('result', {}, 'f=x'), '#/result?f=x');
  assert.equal(buildHash('admin'), '#/admin');
  assert.deepEqual(parseRoute(buildHash('record', { fixtureId: '2026-27_J3_26_matsumoto_nara' })).params,
    { fixtureId: '2026-27_J3_26_matsumoto_nara' });
});

test('routeAccess：ログインと管理者の判定', () => {
  assert.equal(routeAccess('trips', null), 'login');
  assert.equal(routeAccess('trips', { isAdmin: false }), 'ok');
  assert.equal(routeAccess('record', null), 'ok');
  assert.equal(routeAccess('admin', null), 'login');
  assert.equal(routeAccess('admin', { isAdmin: false }), 'forbidden');
  assert.equal(routeAccess('admin', { isAdmin: true }), 'ok');
});

test('parseRoute：/trips/new は trip より前に合う', () => {
  const r = parseRoute('#/trips/new?f=x');
  assert.equal(r.name, 'trip-new');
  assert.equal(r.query, 'f=x');
  assert.equal(parseRoute('#/trips/abc').name, 'trip');
});
