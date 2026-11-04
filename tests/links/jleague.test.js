import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JLEAGUE_TOP, normalizeJleagueMatchUrl, jleagueTicketUrl, jleagueMatchLink } from '../../src/core/links/jleague.js';

test('トップのURL', () => {
  assert.equal(JLEAGUE_TOP, 'https://www.jleague.jp/');
});

test('スマホ版の試合URLは /sp/ を取り除いて末尾に / を付ける', () => {
  assert.equal(normalizeJleagueMatchUrl('https://www.jleague.jp/sp/match/j3/2026/091306/'), 'https://www.jleague.jp/match/j3/2026/091306/');
});

test('末尾の / がなければ付ける', () => {
  assert.equal(normalizeJleagueMatchUrl('https://www.jleague.jp/match/j3/2026/091306'), 'https://www.jleague.jp/match/j3/2026/091306/');
});

test('Jリーグ公式以外のURLや試合ページ以外はnull', () => {
  assert.equal(normalizeJleagueMatchUrl('https://example.com/match/'), null);
  assert.equal(normalizeJleagueMatchUrl('https://www.jleague.jp/club/matsumoto/'), null);
  assert.equal(normalizeJleagueMatchUrl('http://www.jleague.jp/match/j3/2026/091306/'), null);
  assert.equal(normalizeJleagueMatchUrl('https://www.jleague.jp/match/'), null);
});

test('文字列でない・不正な入力はnull', () => {
  assert.equal(normalizeJleagueMatchUrl(null), null);
  assert.equal(normalizeJleagueMatchUrl(undefined), null);
  assert.equal(normalizeJleagueMatchUrl(12345), null);
  assert.equal(normalizeJleagueMatchUrl('not a url'), null);
});

test('チケットのURLは試合ページの末尾に ticket/ を付ける', () => {
  assert.equal(jleagueTicketUrl('https://www.jleague.jp/match/j3/2026/091306/'), 'https://www.jleague.jp/match/j3/2026/091306/ticket/');
});

test('試合ページがなければチケットのURLもnull', () => {
  assert.equal(jleagueTicketUrl(null), null);
});

test('試合ページがあれば試合ページを開く', () => {
  assert.equal(jleagueMatchLink({ matchUrl: 'https://www.jleague.jp/match/j3/2026/091306/', clubUrl: 'https://www.jleague.jp/club/gifu/' }), 'https://www.jleague.jp/match/j3/2026/091306/');
});

test('試合ページが空ならクラブのページ', () => {
  assert.equal(jleagueMatchLink({ matchUrl: null, clubUrl: 'https://www.jleague.jp/club/gifu/' }), 'https://www.jleague.jp/club/gifu/');
});

test('試合ページもクラブのページも空ならJリーグ公式のトップ', () => {
  assert.equal(jleagueMatchLink({ matchUrl: null, clubUrl: null }), 'https://www.jleague.jp/');
});

test('jleagueMatchLink: 空文字は無いものとして次の候補へ', () => {
  assert.equal(jleagueMatchLink({ matchUrl: '', clubUrl: 'https://www.jleague.jp/club/gifu/' }), 'https://www.jleague.jp/club/gifu/');
  assert.equal(jleagueMatchLink({ matchUrl: '', clubUrl: '' }), JLEAGUE_TOP);
});
