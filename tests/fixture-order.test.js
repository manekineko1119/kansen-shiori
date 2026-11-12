import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareFixtures, compareFixturesNewestFirst } from '../src/core/fixture-order.js';

const f = (id, date, kickoff) => ({ id, match_date: date, kickoff });
const list = [f('d', '2026-10-05', '14:00'), f('c', '2026-10-04', null), f('b', '2026-10-04', '18:00'), f('a', '2026-10-04', '14:00'), f('e', '2026-10-04', '14:00')];

test('昇順：日付 → キックオフ（未定は同じ日の最後）→ ID', () => {
  assert.deepEqual([...list].sort(compareFixtures).map((x) => x.id), ['a', 'e', 'b', 'c', 'd']);
});

test('新しい順：日付・キックオフは逆（未定は同じ日の先頭）、ID は昇順', () => {
  assert.deepEqual([...list].sort(compareFixturesNewestFirst).map((x) => x.id), ['d', 'c', 'b', 'a', 'e']);
});
