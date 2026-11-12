import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPETITIONS, seasonClubDiff, seasonClubSections, currentCompetitions } from '../src/core/season-clubs.js';

// 管理画面のシーズンの所属（設計書 3.4・11.4）：クラブごとに「なし・J1・J2・J3」を選ぶ

const row = (competition, club_id) => ({ season_id: '2026-27', competition, club_id });
const key = (r) => `${r.competition}/${r.club_id}`;

test('選べる大会は J1・J2・J3', () => {
  assert.deepEqual(COMPETITIONS, ['J1', 'J2', 'J3']);
});

test('差分：足りない所属を足し、外した所属を消し、大会が変わったクラブは古い大会を消して新しい大会を足す', () => {
  const rows = [row('J3', 'a'), row('J3', 'b'), row('J2', 'c'), row('J1', 'd')];
  const want = { a: 'J3', b: 'J2', c: '', d: 'J1', e: 'J3' };
  const { add, drop } = seasonClubDiff(rows, want);
  assert.deepEqual(add.map(key), ['J2/b', 'J3/e']);
  assert.deepEqual(drop.map(key), ['J3/b', 'J2/c']);
});

test('差分：変えないなら空。選択肢にないクラブの行（クラブの表にない）は触らない', () => {
  const rows = [row('J3', 'a'), row('J3', 'ghost')];
  assert.deepEqual(seasonClubDiff(rows, { a: 'J3', b: '' }), { add: [], drop: [] });
});

test('差分：1つのクラブが2つの大会に入っていたら、選んだ大会だけ残す', () => {
  const rows = [row('J3', 'a'), row('J2', 'a')];
  const { add, drop } = seasonClubDiff(rows, { a: 'J2' });
  assert.deepEqual(add, []);
  assert.deepEqual(drop.map(key), ['J3/a']);
});

test('差分：J1・J2・J3 と空以外の値は受け付けない', () => {
  assert.throws(() => seasonClubDiff([], { a: 'J4' }), /J4/);
});

test('見出し：今の所属の大会ごとに J1・J2・J3・所属なしの順でまとめ、空の見出しは出さない', () => {
  const clubs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const rows = [row('J3', 'a'), row('J1', 'c'), row('J3', 'd')];
  assert.deepEqual(seasonClubSections(clubs, rows).map((s) => [s.competition, s.label, s.clubs.map((c) => c.id)]), [
    ['J1', 'J1', ['c']],
    ['J3', 'J3', ['a', 'd']],
    ['', '所属なし', ['b']],
  ]);
});

test('見出し：所属の行がない（新しいシーズン）ときは、全部「所属なし」', () => {
  assert.deepEqual(seasonClubSections([{ id: 'a' }], []).map((s) => s.label), ['所属なし']);
  assert.deepEqual(seasonClubSections([], []), []);
});

test('今の所属の大会（クラブ → 大会）。2つの大会に入っていたら J1 に近いほう', () => {
  const current = currentCompetitions([row('J3', 'a'), row('J2', 'a'), row('J1', 'b')]);
  assert.deepEqual(Object.fromEntries(current), { a: 'J2', b: 'J1' });
});
