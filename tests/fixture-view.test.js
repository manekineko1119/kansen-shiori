import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureSide, opponentOf, venueOf, competitionLabel, statusLabel, bandLabel, splitScorers } from '../src/core/fixture-view.js';

const clubsById = { matsumoto: { id: 'matsumoto', name: '松本山雅FC', short_name: '松本', home_stadium_id: 'alwin' },
  gifu: { id: 'gifu', name: 'FC岐阜', short_name: '岐阜', home_stadium_id: 'gifu-memorial' } };
const stadiumsById = { alwin: { id: 'alwin', name: 'サンプロ アルウィン' }, 'gifu-memorial': { id: 'gifu-memorial', name: '岐阜メモリアルセンター長良川競技場' } };
const f = { id: 'x', home_club_id: 'gifu', away_club_id: 'matsumoto', competition: 'J3', round: '12', status: 'scheduled' };

test('H/A と相手', () => {
  assert.equal(fixtureSide(f, 'matsumoto'), 'A');
  assert.equal(fixtureSide({ ...f, home_club_id: 'matsumoto', away_club_id: 'gifu' }, 'matsumoto'), 'H');
  assert.equal(fixtureSide({ ...f, away_club_id: 'nara' }, 'matsumoto'), null);
  assert.equal(opponentOf(f, 'matsumoto', clubsById).short_name, '岐阜');
  assert.equal(opponentOf({ ...f, home_club_id: 'unknown' }, 'matsumoto', clubsById).name, 'unknown');
});

test('会場：指定 → ホームのクラブの本拠地 → 会場未定', () => {
  assert.equal(venueOf(f, { clubsById, stadiumsById }).name, '岐阜メモリアルセンター長良川競技場');
  assert.equal(venueOf({ ...f, venue_stadium_id: 'alwin' }, { clubsById, stadiumsById }).stadium.id, 'alwin');
  assert.deepEqual(venueOf({ ...f, venue_name_override: '長野Uスタジアム' }, { clubsById, stadiumsById }).name, '長野Uスタジアム');
  assert.deepEqual(venueOf({ ...f, home_club_id: 'unknown' }, { clubsById, stadiumsById }), { stadium: null, name: '会場未定' });
});

test('大会名・状態', () => {
  assert.equal(competitionLabel(f), '明治安田J3リーグ 第12節');
  assert.equal(competitionLabel({ competition: 'LEVAIN', round: '2回戦' }), 'ルヴァンカップ 2回戦');
  assert.equal(competitionLabel({ competition: 'EMPEROR', round: null }), '天皇杯');
  assert.equal(competitionLabel({ competition: 'XYZ', round: null }), 'XYZ');
  assert.equal(competitionLabel({ competition: 'FRIENDLY', round: null }), 'トレーニングマッチ');
  assert.deepEqual(['finished', 'postponed', 'cancelled', 'scheduled'].map((s) => statusLabel({ status: s, home_score: 1, away_score: 0 })), ['試合終了', '延期', '試合中止', '']);
  assert.equal(statusLabel({ status: 'finished', home_score: null, away_score: null }), '結果未登録');
});

test('帯の文字', () => {
  const ctxB = { fixturesById: { x: f, y: { ...f, id: 'y', status: 'finished', home_score: 1, away_score: 3 } }, clubsById, tripsById: { t1: { id: 't1', title: '岐阜遠征' } }, supportClubId: 'matsumoto' };
  assert.deepEqual(bandLabel({ type: 'fixture', fixtureId: 'x', homeAway: 'A' }, ctxB), { short: 'A 岐阜', long: 'A 岐阜' });
  assert.deepEqual(bandLabel({ type: 'result', fixtureId: 'y', homeAway: 'A', outcome: 'win' }, ctxB), { short: '○3-1', long: '○ A 岐阜 3-1' });
  assert.deepEqual(bandLabel({ type: 'result', fixtureId: 'y', homeAway: 'A', outcome: null }, ctxB), { short: 'A 岐阜', long: 'A 岐阜 結果未登録' });
  assert.deepEqual(bandLabel({ type: 'record', fixtureId: 'y' }, ctxB), { short: '記録', long: '観戦記録' });
  assert.deepEqual(bandLabel({ type: 'trip', tripId: 't1' }, ctxB), { short: '遠征', long: '岐阜遠征' });
});

test('得点者を左右に分ける', () => {
  assert.deepEqual(splitScorers({ ...f, scorers: [
    { club_id: 'gifu', player: '田中 太一', minute: '64', type: 'goal' },
    { club_id: 'matsumoto', player: '山田 健', minute: '90+2', type: 'penalty' },
    { club_id: 'matsumoto', player: '佐藤 陸', minute: '18', type: 'own_goal' }] }),
  { home: ["田中 太一 64'"], away: ["90+2' 山田 健（PK）", "18' 佐藤 陸（OG）"] });
  assert.deepEqual(splitScorers({ ...f, scorers: null }), { home: [], away: [] });
});
