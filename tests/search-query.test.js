import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildResultQuery, parseResultQuery, pushHistory, removeHistory } from '../src/core/search-query.js';

const FID = '2026-27_J3_15_gifu_matsumoto';

test('試合IDから作ったURLの条件を読み戻せる', () => {
  const q = buildResultQuery({ fixtureId: FID, modes: ['train', 'bus'], lodging: 'post', origin: 'settings' });
  assert.equal(q, 'f=2026-27_J3_15_gifu_matsumoto&m=train%2Cbus&l=post');
  assert.deepEqual(parseResultQuery(q), { fixtureId: FID, custom: null, modes: ['train', 'bus'], lodging: 'post', origin: 'settings' });
});

test('宿泊なし・出発地が設定のときは l と here を出さない', () => {
  assert.equal(buildResultQuery({ fixtureId: 'x', modes: [], lodging: 'none', origin: 'settings' }), 'f=x');
});

test('現在地からのときは here=1 になり、読み戻すと here', () => {
  const q = buildResultQuery({ fixtureId: 'x', modes: ['car'], lodging: 'none', origin: 'here' });
  assert.equal(q, 'f=x&m=car&here=1');
  assert.equal(parseResultQuery(q).origin, 'here');
});

test('手入力の試合は o・d・k・v で往復できる', () => {
  const custom = { opponentId: 'gifu', date: '2026-11-21', kickoff: '14:00', venue: '岐阜メモリアルセンター' };
  const q = buildResultQuery({ custom, modes: ['plane'], lodging: 'both', origin: 'settings' });
  const p = parseResultQuery(q);
  assert.deepEqual(p.custom, custom);
  assert.equal(p.fixtureId, null);
  assert.deepEqual(p.modes, ['plane']);
  assert.equal(p.lodging, 'both');
});

test('キックオフ未定の手入力は k を出さず、読むと kickoff は null', () => {
  const q = buildResultQuery({ custom: { opponentId: 'gifu', date: '2026-11-21', kickoff: null, venue: null }, modes: [], lodging: 'none', origin: 'settings' });
  assert.equal(q, 'o=gifu&d=2026-11-21');
  assert.deepEqual(parseResultQuery(q).custom, { opponentId: 'gifu', date: '2026-11-21', kickoff: null, venue: null });
});

test('未知の m・l の値は捨てる', () => {
  assert.deepEqual(parseResultQuery('f=x&m=train,rocket&l=zzz').modes, ['train']);
  assert.equal(parseResultQuery('f=x&l=zzz').lodging, 'none');
});

test('先頭の ? があっても読める', () => {
  assert.equal(parseResultQuery('?f=x&m=bus').fixtureId, 'x');
});

test('試合も手入力もなければ null', () => {
  assert.equal(parseResultQuery('m=train'), null);
  assert.equal(parseResultQuery(''), null);
});

test('履歴は先頭に足し、同じ条件は前のものを消し、5件までにする', () => {
  assert.deepEqual(pushHistory(['a', 'b', 'c', 'd', 'e'], 'c'), ['c', 'a', 'b', 'd', 'e']);
  assert.deepEqual(pushHistory(['a', 'b', 'c', 'd', 'e'], 'z'), ['z', 'a', 'b', 'c', 'd']);
  assert.deepEqual(pushHistory([], 'a'), ['a']);
});

test('履歴は元の配列を書き換えない', () => {
  const h = ['a', 'b'];
  pushHistory(h, 'c');
  assert.deepEqual(h, ['a', 'b']);
});

test('履歴から1件を除く。順番は変えず、元の配列は書き換えない', () => {
  const h = ['a', 'b', 'c'];
  assert.deepEqual(removeHistory(h, 'b'), ['a', 'c']);
  assert.deepEqual(h, ['a', 'b', 'c']);
  assert.deepEqual(removeHistory(h, 'z'), ['a', 'b', 'c']); // ないものは何もしない
  assert.deepEqual(removeHistory([], 'a'), []);
});

test('parseResultQuery: 日付とキックオフの形が正しくなければ null', () => {
  const r = parseResultQuery('o=gifu&d=2026-13-99x&k=25:99');
  assert.equal(r.custom.date, null);
  assert.equal(r.custom.kickoff, null);
  const ok = parseResultQuery('o=gifu&d=2026-11-21&k=14:00');
  assert.equal(ok.custom.date, '2026-11-21');
  assert.equal(ok.custom.kickoff, '14:00');
});

test('parseResultQuery: 存在しない日付は null', () => {
  assert.equal(parseResultQuery('o=gifu&d=2026-13-99').custom.date, null);
  assert.equal(parseResultQuery('o=gifu&d=2026-02-30').custom.date, null);
});
