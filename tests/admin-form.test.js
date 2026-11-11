import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stadiumFromForm, clubFromForm, moveItem, stationRows, airportRows, replaceRows,
  stadiumToValues, clubToValues, mapStadiumErrors, toyokoHotelFromInput,
} from '../src/core/admin-form.js';
import { validateStadium } from '../src/core/validate.js';

const today = '2026-11-11';
const base = {
  id: 'gifu-memorial', name: '長良川競技場', prefecture: '岐阜県', address: '岐阜市', lat: '35.4', lng: '136.7',
  station_0_name: '名鉄岐阜', station_0_kind: 'shuttle', station_0_walk_min: '', station_0_note: '',
  station_0_toyoko_0_url: 'https://www.toyoko-inn.com/search/detail/00123/', station_0_toyoko_0_name: '東横INN岐阜', station_0_toyoko_0_walk_min: '３',
  station_1_name: '', agoda_url: 'https://www.agoda.com/ja-jp/search?city=1234', verified_at: '',
};

test('スタジアム：駅・東横イン・Agoda・最終確認日を保存する値にする（空の行は捨てる、全角の数字は半角）', () => {
  const st = stadiumFromForm(base, today);
  assert.deepEqual(st.stations, [{ name: '名鉄岐阜', kind: 'shuttle', walk_min: null, note: null, toyoko: [{ hotel: '00123', name: '東横INN岐阜', walk_min: 3 }] }]);
  assert.deepEqual([st.lat, st.lng, st.agoda_area, st.verified_at], [35.4, 136.7, { type: 'city', id: 1234 }, '2026-11-11']);
  assert.deepEqual([st.access_url, st.shuttle_note, st.parking_note, st.airports], [null, null, null, []]);
  assert.equal(validateStadium(st).ok, true);
});

test('スタジアム：読めない東横インの URL は hotel を null にして、検証が止める', () => {
  const st = stadiumFromForm({ ...base, station_0_toyoko_0_url: 'https://example.com/' }, today);
  assert.equal(st.stations[0].toyoko[0].hotel, null);
  assert.ok(validateStadium(st).errors['stations.0.toyoko.0.hotel']);
});

test('東横インの入力：URL か、5桁の番号（全角も）。それ以外は null', () => {
  assert.equal(toyokoHotelFromInput(' https://www.toyoko-inn.com/search/detail/00298/ '), '00298');
  assert.equal(toyokoHotelFromInput('００２９８'), '00298');
  assert.equal(toyokoHotelFromInput('298'), null);
  assert.equal(toyokoHotelFromInput(''), null);
});

test('スタジアム：Agoda は region も読む。名前は入れたときだけ。読めない URL は検証が止める。空なら null', () => {
  assert.deepEqual(stadiumFromForm({ ...base, agoda_url: 'https://www.agoda.com/ja-jp/search?region=831', agoda_name: ' 岐阜市郊外 ' }, today).agoda_area, { type: 'region', id: 831, name: '岐阜市郊外' });
  const bad = stadiumFromForm({ ...base, agoda_url: 'https://example.com/?city=1' }, today);
  assert.ok(validateStadium(bad).errors.agoda_area);
  assert.equal(stadiumFromForm({ ...base, agoda_url: '' }, today).agoda_area, null);
});

test('スタジアム：最終確認日は入力があればそのまま（スラッシュはハイフンに、全角は半角に）', () => {
  assert.equal(stadiumFromForm({ ...base, verified_at: '２０２６/10/20' }, today).verified_at, '2026-10-20');
  assert.equal(stadiumFromForm({ ...base, verified_at: '2026-10-20' }, today).verified_at, '2026-10-20');
});

test('スタジアム：数値が読めなければ NaN（検証が項目ごとに止める）。駅の徒歩は空なら null', () => {
  const st = stadiumFromForm({ ...base, lat: 'abc', lng: '', station_0_walk_min: '１５', station_1_name: '岐阜', station_1_kind: 'bus', station_1_walk_min: 'x' }, today);
  assert.deepEqual([Number.isNaN(st.lat), Number.isNaN(st.lng)], [true, true]);
  assert.equal(st.stations[0].walk_min, 15);
  assert.ok(Number.isNaN(st.stations[1].walk_min));
  assert.deepEqual(Object.keys(validateStadium(st).errors).sort(), ['lat', 'lng', 'stations.1.walk_min']);
});

test('スタジアム：空港の行（コードは大文字、駅は空なら null）', () => {
  const st = stadiumFromForm({ ...base, airport_0_iata: ' oka ', airport_0_name: '那覇空港', airport_0_station: '', airport_0_access_min: '５０', airport_0_note: 'ゆいレール', airport_1_iata: '', airport_1_name: '' }, today);
  assert.deepEqual(st.airports, [{ iata: 'OKA', name: '那覇空港', station: null, access_min: 50, note: 'ゆいレール' }]);
});

test('スタジアム：駅の名前が空でも東横インがあれば捨てずに、検証が止める', () => {
  const st = stadiumFromForm({ ...base, station_1_name: '', station_1_kind: 'nearest', station_1_toyoko_0_url: '00123', station_1_toyoko_0_name: '', station_1_toyoko_0_walk_min: '2' }, today);
  assert.equal(st.stations.length, 2);
  assert.ok(validateStadium(st).errors['stations.1.name']);
});

test('moveItem：先頭へ・隣へ・範囲外は動かさない。元の配列は変えない', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 3), ['a', 'b', 'c']);
  const list = ['a', 'b'];
  assert.notEqual(moveItem(list, 0, 0), list);
});

test('駅の行の並べ替え：行（東横インも）ごと入れ替わり、番号は 0 から振り直す', () => {
  const values = { ...base, station_1_name: '岐阜', station_1_kind: 'nearest', station_1_walk_min: '', station_1_note: 'バス' };
  const rows = stationRows(values);
  assert.equal(rows.length, 2);
  const next = replaceRows(values, { stations: moveItem(rows, 1, 0) });
  assert.equal(next.station_0_name, '岐阜');
  assert.equal(next.station_0_toyoko_0_name, undefined);
  assert.equal(next.station_1_name, '名鉄岐阜');
  assert.equal(next.station_1_toyoko_0_name, '東横INN岐阜');
  assert.equal(next.id, 'gifu-memorial');
  assert.deepEqual(stadiumFromForm(next, today).stations.map((s) => s.name), ['岐阜', '名鉄岐阜']);
});

test('replaceRows：消した行のキーが残らない。空港も入れ替えられる', () => {
  const values = { ...base, airport_0_iata: 'OKA', airport_1_iata: 'NGO' };
  const next = replaceRows(values, { stations: [], airports: airportRows(values).slice(1) });
  assert.deepEqual(Object.keys(next).filter((k) => k.startsWith('station_')), []);
  assert.equal(next.airport_0_iata, 'NGO');
  assert.equal('airport_1_iata' in next, false);
});

test('スタジアム → 入力欄の値 → スタジアム（編集の往復で変わらない）', () => {
  const st = stadiumFromForm({ ...base, airport_0_iata: 'OKA', airport_0_name: '那覇', airport_0_access_min: '50', access_url: 'https://example.com/a', shuttle_note: 'メモ' }, today);
  const values = stadiumToValues(st);
  assert.equal(values.station_0_toyoko_0_url, 'https://www.toyoko-inn.com/search/detail/00123/');
  assert.equal(values.agoda_url, 'https://www.agoda.com/ja-jp/search?city=1234');
  assert.equal(values.lat, '35.4');
  assert.deepEqual(stadiumFromForm(values, today), st);
  const named = { ...st, agoda_area: { type: 'region', id: 831, name: '岐阜' }, verified_at: '2026-10-20' };
  assert.deepEqual(stadiumFromForm(stadiumToValues(named), today), named);
});

test('検証の理由のキーを、画面の行の番号に直す（空の行を飛ばした分のずれを戻す）', () => {
  const values = {
    ...base, station_0_name: '', station_0_kind: 'nearest', station_0_toyoko_0_url: '', station_0_toyoko_0_name: '', station_0_toyoko_0_walk_min: '',
    station_1_name: '岐阜', station_1_kind: 'nearest',
    station_1_toyoko_0_url: '', station_1_toyoko_0_name: '', station_1_toyoko_0_walk_min: '',
    station_1_toyoko_1_url: 'https://example.com/', station_1_toyoko_1_name: 'x', station_1_toyoko_1_walk_min: '99',
    agoda_url: 'https://example.com/?city=1',
  };
  const st = stadiumFromForm(values, today);
  assert.equal(st.stations.length, 1);
  const errors = mapStadiumErrors(validateStadium(st).errors, values);
  assert.deepEqual(Object.keys(errors).sort(), ['agoda_url', 'stations.1.toyoko.1.hotel', 'stations.1.toyoko.1.walk_min']);
  assert.match(errors['stations.1.toyoko.1.hotel'], /東横イン/);
  assert.match(errors.agoda_url, /Agoda/);
});

test('クラブ：別名は改行区切り（空行・前後の空白を捨てる）。動画の取得元はハンドルと種類ごとのキーワード', () => {
  const club = clubFromForm({ id: 'matsumoto', name: '松本山雅FC', short_name: '松本', aliases: '松本山雅\n\n MATSUMOTO YAMAGA FC ', video_channel: '@yamagachannel', video_kw_highlight: '明治安田', video_kw_inside: '【INSIDE】' });
  assert.deepEqual(club.aliases, ['松本山雅', 'MATSUMOTO YAMAGA FC']);
  assert.deepEqual(club.video_sources, [{ channel: '@yamagachannel', kinds: { highlight: ['明治安田'], inside: ['【INSIDE】'] } }]);
  assert.equal('theme_colors' in club, false);
  assert.deepEqual([club.official_url, club.jleague_url, club.home_stadium_id], [null, null, null]);
});

test('クラブ：ハンドルに @ がなければ付ける。ハンドルが空なら取得元なし。キーワードが空の種類は入れない', () => {
  const v = { id: 'a', name: 'A', short_name: 'a' };
  assert.deepEqual(clubFromForm({ ...v, video_channel: 'yamagachannel', video_kw_highlight: 'x\ny' }).video_sources, [{ channel: '@yamagachannel', kinds: { highlight: ['x', 'y'] } }]);
  assert.deepEqual(clubFromForm({ ...v, video_channel: ' ', video_kw_highlight: 'x' }).video_sources, []);
  const c = clubFromForm({ ...v, home_stadium_id: 'sunpro', official_url: ' https://a.example/ ' });
  assert.deepEqual([c.home_stadium_id, c.official_url], ['sunpro', 'https://a.example/']);
});

test('クラブ → 入力欄の値 → クラブ', () => {
  const club = { id: 'matsumoto', name: '松本山雅FC', short_name: '松本', aliases: ['松本山雅', 'MATSUMOTO YAMAGA FC'], official_url: 'https://www.yamaga-fc.com/', jleague_url: null, home_stadium_id: 'sunpro-alwin', video_sources: [{ channel: '@yamagachannel', kinds: { highlight: ['明治安田'], inside: ['【INSIDE】'] } }] };
  const values = clubToValues({ ...club, theme_colors: { primary: '#0E5A3A' } });
  assert.equal(values.aliases, '松本山雅\nMATSUMOTO YAMAGA FC');
  assert.equal(values.video_kw_inside, '【INSIDE】');
  assert.deepEqual(clubFromForm(values), club);
});
