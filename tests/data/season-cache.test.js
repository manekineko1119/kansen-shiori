import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeasonCache } from '../../src/data/season-cache.js';
import { fakeClient } from '../helpers/fake-supabase.js';

const tick = () => new Promise((r) => setTimeout(r, 0));
const tables = () => ({
  seasons: [{ id: '2025', starts_on: '2025-02-01' }, { id: '2026-27', starts_on: '2026-08-01' }],
  fixtures: [{ id: 'b', season_id: '2025', match_date: '2025-11-15', kickoff: '14:00:00' }, { id: 'a', season_id: '2026-27', match_date: '2026-11-15', kickoff: null }],
});

test('シーズンの試合：読み込み中は undefined、読めたら配列。同じシーズンは通信1回。読み終わると onChange', async () => {
  const client = fakeClient(tables());
  let changed = 0;
  const cache = createSeasonCache({ client: () => client, onChange: () => { changed++; } });
  assert.equal(cache.fixtures('2025'), undefined);
  assert.equal(cache.fixtures('2025'), undefined);
  await tick();
  assert.equal(changed, 1);
  assert.deepEqual(cache.fixtures('2025').map((f) => [f.id, f.kickoff]), [['b', '14:00']]);
  assert.equal(client.calls.filter((c) => c.table === 'fixtures').length, 1);
});

test('シーズンの選択肢：新しい順。1回だけ読む', async () => {
  const client = fakeClient(tables());
  const cache = createSeasonCache({ client: () => client, onChange: () => {} });
  assert.equal(cache.seasons(), undefined);
  await tick();
  assert.deepEqual(cache.seasons().map((s) => s.id), ['2026-27', '2025']);
  assert.equal(client.calls.filter((c) => c.table === 'seasons').length, 1);
});

test('通信できないときは null（読み込めませんでした）。reset で読み直せる', async () => {
  const down = fakeClient(tables(), { throwOn: ['fixtures', 'seasons'] });
  const cache = createSeasonCache({ client: () => down, onChange: () => {} });
  cache.fixtures('2025'); cache.seasons();
  await tick();
  assert.equal(cache.fixtures('2025'), null);
  assert.equal(cache.seasons(), null);
  const up = fakeClient(tables());
  const cache2 = createSeasonCache({ client: () => up, onChange: () => {} });
  cache2.fixtures('2025');
  await tick();
  cache2.reset();
  assert.equal(cache2.fixtures('2025'), undefined);
  await tick();
  assert.equal(up.calls.filter((c) => c.table === 'fixtures').length, 2);
  assert.equal(cache2.fixtures('2025').length, 1);
});

test('シーズンの所属クラブ：読み込み中は undefined、読めたら配列。同じシーズンは通信1回', async () => {
  const client = fakeClient({ season_clubs: [{ season_id: '2025', competition: 'J3', club_id: 'a' }, { season_id: '2026-27', competition: 'J3', club_id: 'b' }] });
  let changed = 0;
  const cache = createSeasonCache({ client: () => client, onChange: () => { changed++; } });
  assert.equal(cache.seasonClubs('2025'), undefined);
  assert.equal(cache.seasonClubs('2025'), undefined);
  await tick();
  assert.equal(changed, 1);
  assert.deepEqual(cache.seasonClubs('2025').map((r) => r.club_id), ['a']);
  assert.equal(client.calls.filter((c) => c.table === 'season_clubs').length, 1);
});

test('resetSeasons：シーズンの選択肢・所属クラブ・試合をすべて捨てて、読み直す', async () => {
  const client = fakeClient({ ...tables(), season_clubs: [{ season_id: '2025', competition: 'J3', club_id: 'a' }] });
  const cache = createSeasonCache({ client: () => client, onChange: () => {} });
  cache.seasons(); cache.seasonClubs('2025'); cache.fixtures('2025');
  await tick();
  cache.resetSeasons();
  assert.deepEqual([cache.seasons(), cache.seasonClubs('2025'), cache.fixtures('2025')], [undefined, undefined, undefined]);
  await tick();
  assert.equal(cache.seasons().length, 2);
  assert.equal(client.calls.filter((c) => c.table === 'season_clubs').length, 2);
});
