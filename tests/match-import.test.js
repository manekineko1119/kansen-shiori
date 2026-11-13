import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUP_COMPETITIONS, seasonForDate, planMatchImport } from '../src/core/match-import.js';

const NOW = '2026-11-13T00:00:00.000Z';
const URL_ = 'https://www.jleague.jp/match/leaguecup/2026/090901/';
const season = { id: '2026-27', starts_on: '2026-08-01', ends_on: '2027-05-23' };
const clubs = [
  { id: 'matsumoto', name: '松本山雅ＦＣ', short_name: '松本', aliases: [], jleague_url: 'https://www.jleague.jp/club/matsumoto/', home_stadium_id: 'alwin' },
  { id: 'shonan', name: '湘南ベルマーレ', short_name: '湘南', aliases: [], jleague_url: 'https://www.jleague.jp/club/shonan/', home_stadium_id: 'lemon' },
];
const stadiums = [
  { id: 'alwin', name: 'サンプロ アルウィン' },
  { id: 'lemon', name: 'レモンガススタジアム平塚' },
  { id: 'other', name: 'ニッパツ三ツ沢球技場' },
];
const scorer = (player, minute) => ({ player, minute, type: 'goal' });
function makePage(over = {}) {
  return {
    tournament: 'leaguecup', tournamentName: 'ＪリーグＷＥＳＴ', section: '1回戦',
    date: '2026-09-09', kickoff: '19:00', state: 'finished', type: 'cup',
    stadiumName: 'レモンガススタジアム平塚', canceledInfo: '',
    home: { teamCode: 'matsumoto', name: '松本山雅ＦＣ', nameS: '松本', score: 3, scorers: [scorer('A', '10'), scorer('B', '20'), scorer('C', '30')] },
    away: { teamCode: 'shonan', name: '湘南ベルマーレ', nameS: '湘南', score: 3, scorers: [scorer('D', '11'), scorer('E', '22'), scorer('F', '33')] },
    penalty: { home: 4, away: 3 },
    ...over,
  };
}
const ctx = (over = {}) => ({ url: URL_, season, clubs, stadiums, existing: [], supportClubId: 'matsumoto', nowIso: NOW, ...over });
const ID = '2026-27_LEVAIN_1回戦_matsumoto_shonan';

test('CUP_COMPETITIONS', () => {
  assert.deepEqual(CUP_COMPETITIONS, { leaguecup: 'LEVAIN' });
});

test('新しい試合は insert', () => {
  const r = planMatchImport(makePage(), ctx());
  assert.equal(r.ok, true);
  assert.equal(r.mode, 'insert');
  assert.equal(r.id, ID);
  const row = r.row;
  assert.equal(row.id, ID);
  assert.equal(row.season_id, '2026-27');
  assert.equal(row.competition, 'LEVAIN');
  assert.equal(row.round, '1回戦');
  assert.equal(row.match_date, '2026-09-09');
  assert.equal(row.kickoff, '19:00');
  assert.equal(row.jleague_match_url, URL_);
  assert.equal(row.status, 'finished');
  assert.equal(row.home_score, 3);
  assert.equal(row.away_score, 3);
  assert.equal(row.home_pk, 4);
  assert.equal(row.away_pk, 3);
  assert.equal(row.scorers.length, 6);
  assert.equal(row.scorers[0].club_id, 'matsumoto');
  assert.equal(row.result_source, 'api');
  assert.equal(row.result_updated_at, NOW);
  assert.equal(row.scorers_fetched_at, NOW);
  assert.equal(r.view.round, '1回戦');
  assert.deepEqual(r.view.score, [3, 3]);
  assert.deepEqual(r.view.pk, [4, 3]);
  assert.equal(r.view.scorerCount, 6);
});

test('試合前の insert は scheduled で結果の列なし', () => {
  const r = planMatchImport(makePage({ state: 'scheduled', penalty: null }), ctx());
  assert.equal(r.row.status, 'scheduled');
  assert.equal('home_score' in r.row, false);
  assert.equal('scorers' in r.row, false);
  assert.equal(r.view.score, null);
});

test('PK がなければ null', () => {
  const r = planMatchImport(makePage({ penalty: null }), ctx());
  assert.equal(r.row.home_pk, null);
  assert.equal(r.row.away_pk, null);
  assert.equal(r.view.pk, null);
});

test('会場', () => {
  let r = planMatchImport(makePage({ stadiumName: 'サンプロ　アルウィン' }), ctx());
  assert.equal(r.row.venue_stadium_id, null);
  assert.equal(r.row.venue_name_override, null);
  assert.equal(r.view.venue.kind, 'home');
  r = planMatchImport(makePage({ stadiumName: 'ニッパツ三ツ沢球技場' }), ctx());
  assert.equal(r.row.venue_stadium_id, 'other');
  assert.equal(r.view.venue.kind, 'stadium');
  r = planMatchImport(makePage({ stadiumName: '未登録スタジアム' }), ctx());
  assert.equal(r.row.venue_name_override, '未登録スタジアム');
  assert.equal(r.row.venue_stadium_id, null);
  assert.equal(r.view.venue.kind, 'name');
  r = planMatchImport(makePage({ stadiumName: null }), ctx());
  assert.equal(r.row.venue_name_override, null);
  assert.equal(r.row.venue_stadium_id, null);
  assert.equal(r.view.venue.kind, 'none');
});

test('クラブは teamCode、なければ名前', () => {
  const page = makePage();
  page.home.teamCode = 'zzz';
  const r = planMatchImport(page, ctx());
  assert.equal(r.ok, true);
  assert.equal(r.id, ID);
  const bad = makePage();
  bad.home = { ...bad.home, teamCode: 'zzz', name: '架空ユナイテッドＦＣ', nameS: '架空' };
  const r2 = planMatchImport(bad, ctx());
  assert.equal(r2.ok, false);
  assert.ok(r2.errors.includes('架空ユナイテッドＦＣ が登録されていません。先にクラブを登録してください'));
});

test('大会が表にない', () => {
  const r = planMatchImport(makePage({ tournament: 'j3' }), ctx());
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /URL で登録できません/);
});

test('入れ直しは update', () => {
  const r = planMatchImport(makePage(), ctx({ existing: [{ id: ID, status: 'scheduled', jleague_match_url: null }] }));
  assert.equal(r.mode, 'update');
  assert.equal(r.id, ID);
  assert.equal('id' in r.row, false);
  assert.equal('season_id' in r.row, false);
  assert.equal(r.row.jleague_match_url, URL_);
});

test('試合前の入れ直しは日時・会場を送る', () => {
  const r = planMatchImport(makePage({ state: 'scheduled', penalty: null }), ctx({ existing: [{ id: ID, status: 'scheduled' }] }));
  assert.equal(r.row.match_date, '2026-09-09');
  assert.equal(r.row.kickoff, '19:00');
  assert.ok('venue_stadium_id' in r.row && 'venue_name_override' in r.row);
  assert.equal('status' in r.row, false);
  assert.equal('home_score' in r.row, false);
});

test('終わった試合は日時・会場を送らない', () => {
  for (const [state, status] of [['scheduled', 'finished'], ['finished', 'scheduled']]) {
    const r = planMatchImport(makePage({ state }), ctx({ existing: [{ id: ID, status }] }));
    assert.equal(r.ok, true);
    for (const k of ['match_date', 'kickoff', 'venue_stadium_id', 'venue_name_override']) {
      assert.equal(k in r.row, false, k);
    }
  }
});

test('manual は結果を送らない', () => {
  const existing = [{ id: ID, status: 'finished', result_source: 'manual', jleague_match_url: null }];
  const r = planMatchImport(makePage(), ctx({ existing }));
  assert.equal(r.ok, true);
  for (const k of ['home_score', 'away_score', 'home_pk', 'away_pk', 'scorers', 'result_source']) {
    assert.equal(k in r.row, false, k);
  }
  assert.ok(r.warnings.includes('手で直した試合なので、結果・得点者・PK は更新しません'));
  const r2 = planMatchImport(makePage(), ctx({ existing: [{ ...existing[0], jleague_match_url: URL_ }] }));
  assert.equal(r2.ok, false);
  assert.deepEqual(r2.errors, ['更新する項目がありません']);
});

test('得点者の数が合わない', () => {
  const page = makePage();
  page.home.scorers = [scorer('A', '10')];
  const r = planMatchImport(page, ctx());
  assert.deepEqual(r.row.scorers, []);
  assert.equal(r.row.scorers_failed_at, NOW);
  assert.equal('scorers_fetched_at' in r.row, false);
  assert.ok(r.warnings.some((w) => w.includes('得点者の数がスコアと合いません')));
});

test('URL が別の試合にある', () => {
  const r = planMatchImport(makePage(), ctx({ existing: [{ id: 'X_other', jleague_match_url: URL_ }] }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('別の試合ID') && e.includes('X_other')));
});

test('jleague_match_url は空のときだけ送る（update）', () => {
  const r = planMatchImport(makePage(), ctx({ existing: [{ id: ID, status: 'scheduled', jleague_match_url: URL_ }] }));
  assert.equal('jleague_match_url' in r.row, false);
});

test('シーズンがない', () => {
  const r = planMatchImport(makePage({ date: '2028-01-01' }), ctx({ season: null }));
  assert.deepEqual(r.errors, ['この日付（2028-01-01）のシーズンが登録されていません']);
});

test('中止の案内・応援クラブでない', () => {
  let r = planMatchImport(makePage({ canceledInfo: '中止' }), ctx());
  assert.ok(r.warnings.includes('中止・延期の案内があります'));
  r = planMatchImport(makePage(), ctx({ supportClubId: 'other' }));
  assert.ok(r.warnings.includes('応援クラブの試合ではありません'));
  r = planMatchImport(makePage(), ctx());
  assert.equal(r.warnings.includes('応援クラブの試合ではありません'), false);
});

test('seasonForDate', () => {
  const s = [season];
  assert.equal(seasonForDate(s, '2026-08-01'), season);
  assert.equal(seasonForDate(s, '2027-05-23'), season);
  assert.equal(seasonForDate(s, '2026-07-31'), null);
  assert.equal(seasonForDate(s, '2027-05-24'), null);
});
