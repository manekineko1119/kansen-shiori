import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureFromForm, fixtureToValues, validateFixtureForm, importPlan } from '../src/core/fixture-form.js';
import { pendingKickoffCount } from '../src/core/fixtures.js';

const clubIds = new Set(['gifu', 'matsumoto', 'nara']);
const form = {
  id: '', match_date: '2026-10-26', kickoff: '１４:００', competition: 'ｊ3', round: '第12節',
  home_club_id: 'gifu', away_club_id: 'matsumoto', venue_stadium_id: '', venue_name_override: '', jleague_match_url: '', status: 'scheduled',
};

test('日程の1件：新しい試合は ID を作る（大会・節・キックオフは半角にそろえる）', () => {
  const f = fixtureFromForm(form, { seasonId: '2026-27' });
  assert.deepEqual(f, {
    id: '2026-27_J3_12_gifu_matsumoto', season_id: '2026-27', competition: 'J3', round: '12', match_date: '2026-10-26', kickoff: '14:00',
    home_club_id: 'gifu', away_club_id: 'matsumoto', venue_stadium_id: null, venue_name_override: null, jleague_match_url: null, status: 'scheduled',
  });
  assert.equal(validateFixtureForm(f, clubIds).ok, true);
});

test('日程の1件：すでにある試合の ID は、日付・節・クラブを変えても変えない（4.4）', () => {
  const ed = fixtureFromForm({ id: '2026-27_J3_12_gifu_matsumoto', match_date: '2026-10-26', kickoff: '', competition: 'J3', round: '12', home_club_id: 'gifu', away_club_id: 'matsumoto' }, { seasonId: '2026-27' });
  assert.deepEqual([ed.id, ed.kickoff, ed.match_date], ['2026-27_J3_12_gifu_matsumoto', null, '2026-10-26']);
  const moved = fixtureFromForm({ ...form, id: '2026-27_J3_12_gifu_matsumoto', round: '13', home_club_id: 'nara' }, { seasonId: '2026-27' });
  assert.equal(moved.id, '2026-27_J3_12_gifu_matsumoto');
  assert.equal(moved.home_club_id, 'nara');
});

test('日程の1件：状態の欄がなければ status を送らない（終わった試合の結果を消さない）', () => {
  const { status, ...noStatus } = form;
  assert.equal('status' in fixtureFromForm(noStatus, { seasonId: '2026-27' }), false);
});

test('日程の1件：節が空なら round は null、ID の節は日付', () => {
  const f = fixtureFromForm({ ...form, round: '  ' }, { seasonId: '2026-27' });
  assert.deepEqual([f.round, f.id], [null, '2026-27_J3_20261026_gifu_matsumoto']);
});

test('日程の1件：試合ページの URL は /sp/ を取り、読めない URL は検証で止める', () => {
  const sp = fixtureFromForm({ ...form, jleague_match_url: 'https://www.jleague.jp/sp/match/j3/2026/102601/' }, { seasonId: '2026-27' });
  assert.equal(sp.jleague_match_url, 'https://www.jleague.jp/match/j3/2026/102601/');
  const bad = fixtureFromForm({ ...form, jleague_match_url: 'https://example.com/' }, { seasonId: '2026-27' });
  assert.ok(validateFixtureForm(bad, clubIds).errors.jleague_match_url);
});

test('日程の1件：ID を作れない入力（大会が空・日付が変）は id を空にして、検証が理由を出す', () => {
  const f = fixtureFromForm({ ...form, competition: '', match_date: '2026-13-01' }, { seasonId: '2026-27' });
  assert.equal(f.id, '');
  const v = validateFixtureForm(f, clubIds);
  assert.deepEqual(Object.keys(v.errors).sort(), ['competition', 'match_date']);
});

test('日程の1件：会場は登録済みのスタジアムか、名前（未定など）のどちらか', () => {
  const f = fixtureFromForm({ ...form, venue_stadium_id: 'x', venue_name_override: '未定' }, { seasonId: '2026-27' });
  assert.ok(validateFixtureForm(f, clubIds).errors.venue_name_override);
});

test('日程の1件：登録済みの試合 → 入力欄の値（null は空、ID はそのまま）', () => {
  const v = fixtureToValues({
    id: 'X', competition: 'J3', round: null, match_date: '2026-10-26', kickoff: null, home_club_id: 'gifu', away_club_id: 'matsumoto',
    venue_stadium_id: null, venue_name_override: '未定', jleague_match_url: null, status: 'postponed',
  });
  assert.deepEqual(v, {
    id: 'X', competition: 'J3', round: '', match_date: '2026-10-26', kickoff: '', home_club_id: 'gifu', away_club_id: 'matsumoto',
    venue_stadium_id: '', venue_name_override: '未定', jleague_match_url: '', status: 'postponed',
  });
});

const row = (id, extra = {}) => ({
  id, season_id: '2026-27', competition: 'J3', round: '1', match_date: '2026-08-08', kickoff: '18:00', home_club_id: 'a', away_club_id: 'b',
  venue_stadium_id: null, venue_name_override: null, jleague_match_url: 'https://www.jleague.jp/match/j3/2026/080801/', ...extra,
});

test('取り込みの振り分け：新しい試合と上書きする試合に分け、エラー行はそのまま', () => {
  const rowA = row('A');
  const rowB = row('B');
  assert.deepEqual(importPlan({ ok: [rowA, rowB], errors: [{ line: 3, reason: 'x' }] }, [row('A')]),
    { insert: [rowB], update: [rowA], errors: [{ line: 3, reason: 'x' }] });
});

test('取り込みの振り分け：上書きでは結果の列を送らない（取り込んだ結果を消さない）', () => {
  const r = row('A', { status: 'finished', home_score: 1, away_score: 0, scorers: [], result_source: 'api', scorers_fetched_at: 'x', scorers_failed_at: 'y', result_updated_at: 'z' });
  const up = importPlan({ ok: [r], errors: [] }, [row('A')]).update[0];
  for (const k of ['status', 'home_score', 'away_score', 'scorers', 'result_source', 'scorers_fetched_at', 'scorers_failed_at', 'result_updated_at']) {
    assert.equal(k in up, false, k);
  }
});

test('取り込みの振り分け：上書きで試合ページの URL が空なら送らない（自動の取り込みが入れた URL を消さない）', () => {
  const up = importPlan({ ok: [row('A', { jleague_match_url: null })], errors: [] }, [row('A')]).update[0];
  assert.equal('jleague_match_url' in up, false);
  const ins = importPlan({ ok: [row('B', { jleague_match_url: null })], errors: [] }, []).insert[0];
  assert.equal(ins.jleague_match_url, null);
});

test('取り込みの振り分け：節のない試合の日付が変わったら、新しい試合にせず要確認のエラーにする（重複を作らない）', () => {
  const cup = (id, match_date) => row(id, { competition: 'EMPEROR', round: null, match_date });
  const before = cup('2026-27_EMPEROR_20260815_a_b', '2026-08-15');
  const moved = cup('2026-27_EMPEROR_20260822_a_b', '2026-08-22');
  const plan = importPlan({ ok: [moved], errors: [] }, [before]);
  assert.deepEqual([plan.insert.length, plan.update.length, plan.errors.length], [0, 0, 1]);
  assert.equal(plan.errors[0].line, null);
  assert.match(plan.errors[0].reason, /2026-27_EMPEROR_20260815_a_b/);
  // 節のある試合・別の大会の節のない試合は、今までどおり新規
  const other = row('B', { round: '2' });
  const league = cup('2026-27_LEVAIN_20260822_a_b', '2026-08-22');
  league.competition = 'LEVAIN';
  assert.deepEqual(importPlan({ ok: [other, league], errors: [] }, [before]).insert, [other, league]);
});

const fx = (match_date, kickoff, status = 'scheduled') => ({ match_date, kickoff, status });

test('キックオフ未定の件数：今日以降で kickoff が null（延期・中止・終了は数えない）', () => {
  const list = [
    fx('2026-11-11', null), // 昨日：数えない
    fx('2026-11-12', null), // 今日：数える
    fx('2027-03-01', null),
    fx('2027-03-08', '13:00'),
    fx('2027-03-15', null, 'postponed'),
    fx('2027-03-22', null, 'cancelled'),
    fx('2027-03-29', null, 'finished'),
  ];
  assert.equal(pendingKickoffCount(list, '2026-11-12'), 2);
  assert.equal(pendingKickoffCount([], '2026-11-12'), 0);
});
