import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateStadium, validateClub, validateSettings, validateFixture,
  validateTrip, validateMatchRecord, validateEmail,
} from '../src/core/validate.js';

const ok = { id: 'gifu-memorial', name: '岐阜メモリアルセンター長良川競技場', prefecture: '岐阜県', address: '岐阜市長良福光大野2675-28', lat: 35.45, lng: 136.76, stations: [], airports: [] };

test('スタジアム：正しい入力は通る', () => {
  assert.equal(validateStadium(ok).ok, true);
});

test('スタジアム：id・緯度・経度の誤り', () => {
  assert.ok(validateStadium({ ...ok, id: 'Gifu_1' }).errors.id);
  assert.ok(validateStadium({ ...ok, lat: 19.9 }).errors.lat);
  assert.ok(validateStadium({ ...ok, lng: 154.1 }).errors.lng);
});

test('スタジアム：必須項目が空ならエラー', () => {
  const r = validateStadium({ ...ok, name: '', prefecture: '', address: '' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.name && r.errors.prefecture && r.errors.address);
});

test('スタジアム：最寄り空港', () => {
  assert.ok(validateStadium({ ...ok, airports: [{ iata: 'OK', access_min: 50 }] }).errors['airports.0.iata']);
  assert.ok(validateStadium({ ...ok, airports: [{ iata: 'OKA', access_min: 301 }] }).errors['airports.0.access_min']);
  assert.equal(validateStadium({ ...ok, airports: [{ iata: 'OKA', access_min: 50 }] }).ok, true);
});

test('スタジアム：Agodaの地域', () => {
  assert.ok(validateStadium({ ...ok, agoda_area: { type: 'town', id: 1 } }).errors.agoda_area);
  assert.ok(validateStadium({ ...ok, agoda_area: { type: 'city', id: 0 } }).errors.agoda_area);
  assert.equal(validateStadium({ ...ok, agoda_area: { type: 'region', id: 831 } }).ok, true);
  assert.equal(validateStadium({ ...ok, agoda_area: null }).ok, true);
});

test('スタジアム：駅と東横イン', () => {
  const st = (toyoko) => [{ name: '岐阜', kind: 'nearest', toyoko }];
  assert.ok(validateStadium({ ...ok, stations: st([{ hotel: '123', walk_min: 3 }]) }).errors['stations.0.toyoko.0.hotel']);
  assert.ok(validateStadium({ ...ok, stations: st(Array(4).fill({ hotel: '00123', walk_min: 3 })) }).errors['stations.0.toyoko']);
  assert.ok(validateStadium({ ...ok, stations: st([{ hotel: '00123', walk_min: 61 }]) }).errors['stations.0.toyoko.0.walk_min']);
  assert.ok(validateStadium({ ...ok, stations: [{ name: '', kind: 'bus' }] }).errors['stations.0.name']);
  assert.ok(validateStadium({ ...ok, stations: [{ name: '岐阜', kind: 'train' }] }).errors['stations.0.kind']);
  // 種類は最寄り駅・シャトルバスの発着駅・路線バスの発着駅の3つ（設計書 4.1）
  for (const kind of ['nearest', 'shuttle', 'bus']) {
    assert.equal(validateStadium({ ...ok, stations: [{ name: '岐阜', kind, toyoko: [] }] }).ok, true, kind);
  }
  assert.equal(validateStadium({ ...ok, stations: st([{ hotel: '00123', walk_min: 3 }]) }).ok, true);
});

test('クラブ：正しい入力は通り、必須が空ならエラー', () => {
  assert.equal(validateClub({ id: 'gifu', name: 'FC岐阜', short_name: '岐阜' }).ok, true);
  const r = validateClub({ id: '', name: '', short_name: ' ' });
  assert.ok(r.errors.id && r.errors.name && r.errors.short_name);
});

test('設定：出発空港', () => {
  assert.equal(validateSettings({ origin_airports: [{ code: 'tyoa', access_min: 210 }] }).ok, true);
  assert.ok(validateSettings({ origin_airports: [{ code: 'NGO', access_min: 601 }] }).errors['origin_airports.0.access_min']);
  assert.ok(validateSettings({ origin_airports: [{ code: 'TO', access_min: 10 }] }).errors['origin_airports.0.code']);
});

test('日程：キックオフ・クラブ', () => {
  const clubs = new Set(['gifu', 'matsumoto']);
  const base = { match_date: '2026-11-21', kickoff: '14:00', home_club_id: 'gifu', away_club_id: 'matsumoto' };
  assert.equal(validateFixture(base, clubs).ok, true);
  assert.equal(validateFixture({ ...base, kickoff: null }, clubs).ok, true);
  assert.ok(validateFixture({ ...base, kickoff: '25:00' }, clubs).errors.kickoff);
  assert.ok(validateFixture({ ...base, kickoff: null, away_club_id: 'gifu' }, new Set(['gifu'])).errors.away_club_id);
  assert.ok(validateFixture({ ...base, match_date: '' }, clubs).errors.match_date);
  assert.ok(validateFixture({ ...base, away_club_id: 'zzz' }, clubs).errors.away_club_id);
});

test('遠征予定：試合か会場＋日付、タイトル', () => {
  assert.ok(validateTrip({ fixture_id: null, custom_venue: null, custom_date: '2026-11-21', title: '岐阜遠征' }).errors.custom_venue);
  assert.ok(validateTrip({ fixture_id: 'x', title: 'あ'.repeat(51) }).errors.title);
  assert.ok(validateTrip({ fixture_id: 'x', title: '' }).errors.title);
  assert.equal(validateTrip({ fixture_id: 'x', title: 'あ'.repeat(50) }).ok, true);
  assert.equal(validateTrip({ fixture_id: null, custom_venue: '岐阜', custom_date: '2026-11-21', title: '遠征' }).ok, true);
});

test('観戦記録：費用と観戦方法', () => {
  assert.equal(validateMatchRecord({ watch_style: 'stadium', cost_transport: 1200, cost_food: null, cost_goods: '' }).ok, true);
  assert.ok(validateMatchRecord({ watch_style: 'stadium', cost_ticket: -1 }).errors.cost_ticket);
  assert.ok(validateMatchRecord({ watch_style: 'stadium', cost_lodging: 1.5 }).errors.cost_lodging);
  assert.ok(validateMatchRecord({ watch_style: 'tv' }).errors.watch_style);
  assert.equal(validateMatchRecord({ watch_style: 'public_viewing' }).ok, true);
});

test('メール：小文字にそろえる', () => {
  assert.deepEqual(validateEmail(' Tester@Example.com '), { ok: true, errors: {}, value: 'tester@example.com' });
  assert.ok(validateEmail('abc').errors.email);
});

test('日程：存在しない日付はエラー', () => {
  const clubs = new Set(['gifu', 'matsumoto']);
  const base = { match_date: '2027-02-28', kickoff: null, home_club_id: 'gifu', away_club_id: 'matsumoto' };
  assert.equal(validateFixture(base, clubs).ok, true);
  assert.ok(validateFixture({ ...base, match_date: '2027-02-30' }, clubs).errors.match_date);
});

test('遠征予定：空白だけのタイトルはエラー、前後の空白は数えない', () => {
  assert.ok(validateTrip({ fixture_id: 'x', title: '   ' }).errors.title);
  assert.equal(validateTrip({ fixture_id: 'x', title: ` ${'あ'.repeat(50)} ` }).ok, true);
});

test('設定：分の範囲と移動手段（設計書 4.2 の check と同じ）', () => {
  assert.equal(validateSettings({ airport_checkin_min: 240, airport_arrival_min: 0, arrive_before_min: 600, default_modes: ['train', 'car', 'bus', 'plane'] }).ok, true);
  assert.ok(validateSettings({ airport_checkin_min: 999 }).errors.airport_checkin_min);
  assert.ok(validateSettings({ airport_checkin_min: -1 }).errors.airport_checkin_min);
  assert.ok(validateSettings({ airport_arrival_min: 121 }).errors.airport_arrival_min);
  assert.ok(validateSettings({ arrive_before_min: 601 }).errors.arrive_before_min);
  assert.ok(validateSettings({ arrive_before_min: 1.5 }).errors.arrive_before_min);
  assert.ok(validateSettings({ default_modes: ['ship'] }).errors.default_modes);
  assert.ok(validateSettings({ default_modes: 'train' }).errors.default_modes);
});
