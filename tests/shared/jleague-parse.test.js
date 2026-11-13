import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseScheduleList, parseMatchPage, matchFixture, buildScorers, clubSlugFromUrl,
  canonicalMatchPageUrl, parseMatchDetails,
} from '../../supabase/functions/_shared/jleague-parse.js';

const load = (n) => readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8');

test('一覧：1試合目の各項目を読む', () => {
  const { items } = parseScheduleList(load('jleague-list.html'));
  assert.equal(items.length, 2);
  assert.equal(items[0].date, '2026-10-25');
  assert.equal(items[0].kickoff, '14:00');
  assert.equal(items[0].state, 'game-over');
  assert.equal(items[0].matchUrl, 'https://www.jleague.jp/match/j3/2026/102517/');
  assert.equal(items[0].home.fullName, '松本山雅ＦＣ');
  assert.equal(items[0].home.name, '松本');
  assert.equal(items[0].home.score, 0);
  assert.equal(items[0].away.score, 2);
  assert.equal(items[0].stadiumName, '架空 スタジアム');
});

test('一覧：これからの試合は score が null、未定は null', () => {
  const { items } = parseScheduleList(load('jleague-list.html'));
  assert.equal(items[1].home.score, null);
  assert.equal(items[1].away.score, null);
  assert.equal(items[1].kickoff, null);
  assert.equal(items[1].stadiumName, null);
  assert.equal(items[1].state, 'ticket');
});

test('一覧：行が2つの push にまたがっても読める', () => {
  const split = parseScheduleList(load('jleague-list-split.html'));
  const whole = parseScheduleList(load('jleague-list.html'));
  assert.equal(split.items.length, 2);
  assert.deepEqual(split.items, whole.items);
});

test('一覧：データがないときは空と理由', () => {
  const r = parseScheduleList('<html></html>');
  assert.equal(r.items.length, 0);
  assert.ok(r.reason);
});

test('試合ページ：アウェイの得点者の時間、ホームのオウンゴール', () => {
  const page = parseMatchPage(load('jleague-match-goals.html'));
  assert.deepEqual(page.away.scorers.map((s) => s.minute), ['18', '52', '90+2']);
  assert.equal(page.away.score, 3);
  assert.equal(page.home.scorers[0].type, 'own_goal');
  assert.equal(page.away.scorers[0].type, 'goal');
  assert.equal(page.away.scorers[0].player, '山田 一郎');
});

test('試合ページ：0-0 は得点者が空', () => {
  const page = parseMatchPage(load('jleague-match-nil.html'));
  assert.deepEqual(page.home.scorers, []);
  assert.deepEqual(page.away.scorers, []);
  assert.equal(page.home.score, 0);
});

test('試合ページ：項目が足りないと reason', () => {
  assert.ok(parseMatchPage(load('jleague-match-broken.html')).reason);
  assert.ok(parseMatchPage('<html></html>').reason);
});

const ids = { homeClubId: 'matsumoto', awayClubId: 'yamaguchi' };

test('buildScorers：成功。club_id は載っている側', () => {
  const page = parseMatchPage(load('jleague-match-goals.html'));
  const r = buildScorers(page, ids);
  assert.equal(r.reason, undefined);
  assert.deepEqual(r.scorers[0], { club_id: 'matsumoto', player: '架空 太郎', minute: '30', type: 'own_goal' });
  assert.deepEqual(r.scorers.slice(1).map((s) => [s.club_id, s.minute]),
    [['yamaguchi', '18'], ['yamaguchi', '52'], ['yamaguchi', '90+2']]);
});

test('buildScorers：数がスコアと合わないと空と reason', () => {
  const r = buildScorers({ home: { score: 2, scorers: [{ player: 'A', minute: '1', type: 'goal' }] }, away: { score: 0, scorers: [] } }, ids);
  assert.ok(r.reason);
  assert.deepEqual(r.scorers, []);
});

test('buildScorers：オウンゴールがあって数が合わないときも空と reason', () => {
  const r = buildScorers({ home: { score: 0, scorers: [] }, away: { score: 2, scorers: [{ player: 'A', minute: '1', type: 'own_goal' }] } }, ids);
  assert.ok(r.reason);
  assert.deepEqual(r.scorers, []);
});

test('buildScorers：0-0 は空で成功', () => {
  const r = buildScorers(parseMatchPage(load('jleague-match-nil.html')), ids);
  assert.deepEqual(r, { scorers: [] });
});

const clubs = [
  { id: 'matsumoto', name: '松本山雅FC', short_name: '松本', aliases: [] },
  { id: 'yamaguchi', name: 'レノファ山口FC', short_name: '山口', aliases: [] },
];
const fixtures = [{ id: 'f1', match_date: '2026-10-25', home_club_id: 'matsumoto', away_club_id: 'yamaguchi' }];
const item = (date) => ({ date, home: { fullName: '松本山雅ＦＣ', name: '松本' }, away: { fullName: 'レノファ山口ＦＣ', name: '山口' } });

test('matchFixture：日付とクラブ名が合えば id', () => {
  assert.equal(matchFixture(item('2026-10-25'), fixtures, clubs), 'f1');
});

test('matchFixture：name だけでも fullName だけでも照合できる', () => {
  assert.equal(matchFixture({ date: '2026-10-25', home: { name: '松本' }, away: { name: '山口' } }, fixtures, clubs), 'f1');
  assert.equal(matchFixture({ date: '2026-10-25', home: { fullName: '松本山雅ＦＣ' }, away: { fullName: 'レノファ山口ＦＣ' } }, fixtures, clubs), 'f1');
});

test('matchFixture：日程にない日付は null', () => {
  assert.equal(matchFixture(item('2026-10-26'), fixtures, clubs), null);
});

test('matchFixture：ホームとアウェイが逆なら null', () => {
  const rev = { date: '2026-10-25', home: { fullName: 'レノファ山口ＦＣ' }, away: { fullName: '松本山雅ＦＣ' } };
  assert.equal(matchFixture(rev, fixtures, clubs), null);
});

test('matchFixture：別名で照合できる', () => {
  const cs = [{ ...clubs[0], aliases: ['山雅'] }, clubs[1]];
  assert.equal(matchFixture({ date: '2026-10-25', home: { name: '山雅' }, away: { name: '山口' } }, fixtures, cs), 'f1');
});

test('matchFixture：同じ日に同じ組み合わせが2つなら null', () => {
  const two = [...fixtures, { id: 'f2', match_date: '2026-10-25', home_club_id: 'matsumoto', away_club_id: 'yamaguchi' }];
  assert.equal(matchFixture(item('2026-10-25'), two, clubs), null);
});

test('clubSlugFromUrl：クラブの識別子を取り出す', () => {
  assert.equal(clubSlugFromUrl('https://www.jleague.jp/club/matsumoto/'), 'matsumoto');
  assert.equal(clubSlugFromUrl('https://www.jleague.jp/club/matsumoto'), 'matsumoto');
  assert.equal(clubSlugFromUrl('https://www.jleague.jp/'), null);
  assert.equal(clubSlugFromUrl(null), null);
});

const pushHtml = (line) => `<script>self.__next_f.push([1,${JSON.stringify(`${line}\n`)}])</script>`;
const listWith = (hrefs) => pushHtml(`1:${JSON.stringify({ scheduleList: [{ schedules: [{
  matchDate: '$D2026-10-25T00:00:00.000Z',
  matches: hrefs.map((h) => ({ state: 'ticket', detailHref: h, homeTeam: { name: '松本' }, awayTeam: { name: '山口' } })),
}] }] })}`);

test('一覧：試合ページの形でない detailHref は飛ばして、数を skipped に返す', () => {
  const r = parseScheduleList(listWith(['@evil.example/x', '/news/123', 'https://www.jleague.jp/match/j3/2026/102517/', '/match/j3/2026/102517']));
  assert.deepEqual(r.items.map((i) => i.matchUrl), ['https://www.jleague.jp/match/j3/2026/102517/']);
  assert.equal(r.skipped, 3);
});

test('一覧：すべて正しい detailHref なら skipped は付かない', () => {
  const r = parseScheduleList(load('jleague-list.html'));
  assert.equal(r.items.length, 2);
  assert.equal('skipped' in r, false);
});

test('試合ページ：先に得点リストのない見出し風のノードがあっても、両チームに playerScoreList があるノードを読む', () => {
  const header = { homeTeam: { name: '松本', score: 1 }, awayTeam: { name: '山口', score: 0 } };
  const real = { homeTeam: { score: 1, playerScoreList: [{ name: '架空 花子', scoreTime: '10分' }] }, awayTeam: { score: 0, playerScoreList: [] } };
  const page = parseMatchPage(pushHtml(`2:${JSON.stringify([header, real])}`));
  assert.equal(page.reason, undefined);
  assert.deepEqual(page.home.scorers.map((s) => s.player), ['架空 花子']);
  assert.equal(page.away.score, 0);
});

test('canonicalMatchPageUrl', () => {
  const c = 'https://www.jleague.jp/match/leaguecup/2026/090901/';
  for (const u of [c, 'https://www.jleague.jp/match/leaguecup/2026/090901/#summary', 'https://www.jleague.jp/sp/match/leaguecup/2026/090901/lineup/',
    'https://www.jleague.jp/match/leaguecup/2026/090901', ' https://www.jleague.jp/match/leaguecup/2026/090901/?a=1 ']) assert.equal(canonicalMatchPageUrl(u), c);
  for (const u of ['http://www.jleague.jp/match/leaguecup/2026/090901/', 'https://jleague.jp/match/leaguecup/2026/090901/',
    'https://www.jleague.jp/match/leaguecup/2026/0909/', 'https://www.jleague.jp/club/matsumoto/', '', null]) assert.equal(canonicalMatchPageUrl(u), null);
});

test('試合ページ：試合後の見本を読む', () => {
  const d = parseMatchDetails(load('jleague-cup-post.html'));
  assert.equal(d.tournament, 'leaguecup');
  assert.equal(d.tournamentName, '架空カップ');
  assert.equal(d.section, '1回戦');
  assert.equal(d.date, '2026-09-09');
  assert.equal(d.kickoff, '19:00');
  assert.equal(d.state, 'finished');
  assert.equal(d.stadiumName, '架空 スタジアム');
  assert.equal(d.home.teamCode, 'matsumoto');
  assert.equal(d.home.score, 1);
  assert.deepEqual(d.home.scorers, [{ player: '鈴木 次郎', minute: '68', type: 'goal' }]);
  assert.deepEqual(d.away.scorers, [{ player: '山田 一郎', minute: '90+2', type: 'goal' }]);
  assert.deepEqual(d.penalty, { home: 4, away: 3 });
  assert.equal(d.canceledInfo, '');
});

test('試合ページ：試合前の見本を読む', () => {
  const d = parseMatchDetails(load('jleague-cup-pre.html'));
  assert.equal(d.state, 'scheduled');
  assert.equal(d.kickoff, null);
  assert.equal(d.date, '2026-10-15');
  assert.equal(d.stadiumName, null);
  assert.equal(d.home.score, null);
  assert.equal(d.home.scorers, null);
  assert.equal(d.penalty, null);
});

test('試合ページ：PK戦は同点のときだけ、0対0は null', () => {
  const html = load('jleague-cup-post.html');
  assert.equal(parseMatchDetails(html.replace('\\"score\\":1,\\"playerScoreList\\":[{\\"name\\":\\"山田', '\\"score\\":2,\\"playerScoreList\\":[{\\"name\\":\\"山田')).penalty, null);
  assert.equal(parseMatchDetails(html.replace('\\"homeTeamScore\\":4,\\"awayTeamScore\\":3', '\\"homeTeamScore\\":0,\\"awayTeamScore\\":0')).penalty, null);
});

test('試合ページ：大会・回戦のデータがないページは reason', () => {
  assert.ok(parseMatchDetails(load('jleague-list.html')).reason);
});
