import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildResultPage } from '../src/core/result-page.js';
import { parseResultQuery } from '../src/core/search-query.js';
import { yahooTransitUrl } from '../src/core/links/yahoo-transit.js';
import { mapsDirectionsUrl, mapsSearchUrl, restaurantQuery } from '../src/core/links/google-maps.js';
import { busSearchUrl } from '../src/core/links/bus.js';
import { toyokoHotelUrl, toyokoPrefectureUrl } from '../src/core/links/toyoko-inn.js';
import { skyscannerUrl } from '../src/core/links/skyscanner.js';
import { agodaUrl } from '../src/core/links/agoda.js';

// src/core のテストから src/data を読まないため、既定の設定と同じ値をここに書く
const SETTINGS = {
  support_club_id: 'matsumoto',
  origin_station: '松本',
  origin_prefecture: '長野県',
  origin_airports: [
    { code: 'MMJ', name: '信州まつもと空港', station: null, access_min: 30, note: '松本駅からバス・タクシー' },
    { code: 'NGO', name: '中部国際空港', station: '中部国際空港', access_min: 180, note: '特急しなの＋名鉄' },
  ],
  airport_checkin_min: 60,
  airport_arrival_min: 20,
  arrive_before_min: 90,
  default_modes: ['train'],
};

const gifuStadium = {
  id: 'gifu-memorial', name: '長良川競技場', prefecture: '岐阜県', lat: 35.4, lng: 136.7,
  stations: [
    { name: '名鉄岐阜', kind: 'shuttle', toyoko: [{ hotel: '00123', name: '東横INN岐阜', walk_min: 3 }] },
    { name: '岐阜', kind: 'nearest', toyoko: [] },
  ],
  airports: [], agoda_area: null,
};
const hiyagon = {
  id: 'hiyagon', name: 'ひやごんスタジアム', prefecture: '沖縄県', lat: 26.3, lng: 127.8,
  stations: [{ name: '沖縄市', kind: 'bus', toyoko: [] }],
  airports: [{ iata: 'OKA', name: '那覇空港', station: '那覇空港', access_min: 50, note: 'ゆいレール＋路線バス' }],
  agoda_area: { type: 'city', id: 7 },
};
const clubs = {
  matsumoto: { id: 'matsumoto', name: '松本山雅FC', short_name: '松本', home_stadium_id: null, jleague_url: 'https://www.jleague.jp/club/matsumoto/' },
  gifu: { id: 'gifu', name: 'FC岐阜', short_name: '岐阜', home_stadium_id: 'gifu-memorial', jleague_url: 'https://www.jleague.jp/club/gifu/' },
  ryukyu: { id: 'ryukyu', name: 'FC琉球', short_name: '琉球', home_stadium_id: 'hiyagon', jleague_url: null },
};
const fx = (id, over) => ({ id, match_date: '2026-10-25', kickoff: '14:00', home_club_id: 'gifu', away_club_id: 'matsumoto', venue_stadium_id: null, venue_name_override: null, jleague_match_url: null, ...over });
const masters = {
  clubsById: clubs,
  stadiumsById: { 'gifu-memorial': gifuStadium, hiyagon },
  fixturesById: {
    X: fx('X'),
    TBD: fx('TBD', { match_date: '2026-11-08', kickoff: null }),
    OKA: fx('OKA', { match_date: '2026-11-22', home_club_id: 'ryukyu' }),
    URL: fx('URL', { jleague_match_url: 'https://www.jleague.jp/match/j3/2026/102501/' }),
    LONELY: fx('LONELY', { home_club_id: 'unknown-club', venue_name_override: '臨時会場' }),
    NOVENUE: fx('NOVENUE', { home_club_id: 'matsumoto', away_club_id: 'unknown-club' }),
  },
};
const build = (qs, over = {}) => buildResultPage({ query: parseResultQuery(qs), masters, settings: SETTINGS, supportClubId: 'matsumoto', ...over });

test('岐阜（ホーム）：時刻の流れ・経路・バス・宿泊・遠征予定の下書き', () => {
  const page = build('f=X&m=train,car,bus,plane&l=post');
  assert.deepEqual(page.summary, { date: '2026-10-25', kickoff: '14:00', title: 'FC岐阜 vs 松本山雅FC', venueName: '長良川競技場' });
  assert.deepEqual(page.timeline, { arrive: { date: '2026-10-25', time: '12:30' }, kickoff: '14:00', end: { date: '2026-10-25', time: '16:00' } });
  assert.equal(page.stadium, gifuStadium);
  assert.equal(page.train, yahooTransitUrl({ from: '松本', to: '名鉄岐阜', date: '2026-10-25', arriveTime: '12:30' }));
  assert.equal(page.car, mapsDirectionsUrl({ origin: '松本駅', lat: 35.4, lng: 136.7, travelmode: 'driving' }));
  assert.equal(page.bus.outbound, busSearchUrl({ fromPrefecture: '長野県', toPrefecture: '岐阜県', date: '2026-10-25' }));
  assert.equal(page.bus.outboundNight, busSearchUrl({ fromPrefecture: '長野県', toPrefecture: '岐阜県', date: '2026-10-24' }));
  assert.equal(page.bus.inbound, busSearchUrl({ fromPrefecture: '岐阜県', toPrefecture: '長野県', date: '2026-10-25' }));
  assert.deepEqual(page.bus.end, { date: '2026-10-25', time: '16:00' });
  assert.deepEqual([page.lodging.checkIn, page.lodging.checkOut, page.lodging.nights], ['2026-10-25', '2026-10-26', 1]);
  assert.deepEqual(page.lodging.hotels, [{
    name: '東横INN岐阜', walk_min: 3, station: '名鉄岐阜', kind: 'shuttle',
    url: toyokoHotelUrl({ hotel: '00123', checkIn: '2026-10-25', checkOut: '2026-10-26' }),
  }]);
  assert.equal(page.lodging.prefectureUrl, toyokoPrefectureUrl({ prefecture: '岐阜県', checkIn: '2026-10-25', checkOut: '2026-10-26' }));
  assert.equal(page.lodging.agodaUrl, agodaUrl({ area: null, checkIn: '2026-10-25', nights: 1 }));
  assert.equal(page.food, mapsSearchUrl({ query: restaurantQuery('長良川競技場') }));
  assert.equal(page.jleague.match, 'https://www.jleague.jp/club/gifu/');
  assert.equal(page.jleague.ticket, null);
  assert.deepEqual(page.tripDraft, { fixture_id: 'X', custom_venue: null, custom_date: null, title: '岐阜遠征', modes: ['train', 'car', 'bus', 'plane'], lodging: 'post' });
});

test('最寄り空港がないスタジアムの飛行機：目的地なしのスカイスキャナー', () => {
  const page = build('f=X&m=plane&l=post');
  assert.equal(page.flight.noAirport, true);
  assert.equal(page.flight.skyscanner[0].url, 'https://www.skyscanner.jp/');
  assert.deepEqual(page.flight.skyscanner.map((s) => [s.code, s.name]), [['MMJ', '信州まつもと空港'], ['NGO', '中部国際空港']]);
});

test('交通手段に入っていないものと、宿泊なしは null', () => {
  const p = build('f=X&m=train');
  assert.deepEqual([p.car, p.bus, p.flight, p.lodging], [null, null, null, null]);
  assert.equal(typeof p.train, 'string');
  assert.equal(build('f=X&m=car').train, null);
});

test('Jリーグ公式：試合ページがあれば試合ページとチケット', () => {
  const p = build('f=URL&m=train');
  assert.equal(p.jleague.match, 'https://www.jleague.jp/match/j3/2026/102501/');
  assert.equal(p.jleague.ticket, 'https://www.jleague.jp/match/j3/2026/102501/ticket/');
});

test('キックオフ未定：到着目標・終了の目安なし。乗換は日付だけ、バスの終了の目安なし', () => {
  const p = build('f=TBD&m=train,bus');
  assert.deepEqual(p.timeline, { arrive: null, kickoff: null, end: null });
  assert.equal(p.summary.kickoff, null);
  assert.equal(p.train, yahooTransitUrl({ from: '松本', to: '名鉄岐阜', date: '2026-11-08', arriveTime: null }));
  assert.equal(p.bus.end, null);
});

test('現在地から：電車も車も出発地なしの Googleマップ', () => {
  const p = build('f=X&m=train,car&here=1');
  assert.equal(p.train, mapsDirectionsUrl({ origin: null, lat: 35.4, lng: 136.7, travelmode: 'transit' }));
  assert.equal(p.car, mapsDirectionsUrl({ origin: null, lat: 35.4, lng: 136.7, travelmode: 'driving' }));
});

test('駅が未登録のスタジアム：到着地はスタジアム名', () => {
  const noStation = { ...masters, stadiumsById: { ...masters.stadiumsById, 'gifu-memorial': { ...gifuStadium, stations: [] } } };
  const p = build('f=X&m=train&l=pre', { masters: noStation });
  assert.equal(p.train, yahooTransitUrl({ from: '松本', to: '長良川競技場', date: '2026-10-25', arriveTime: '12:30' }));
  assert.deepEqual(p.lodging.hotels, []);
});

test('宿泊：前泊＋後泊は前日から翌日まで2泊', () => {
  const p = build('f=X&m=train&l=both');
  assert.deepEqual([p.lodging.checkIn, p.lodging.checkOut, p.lodging.nights], ['2026-10-24', '2026-10-26', 2]);
});

test('会場の手入力（スタジアムなし）：電車も車も会場名の Googleマップ検索、宿は県不明', () => {
  const p = build('f=LONELY&m=train,car,bus&l=post');
  assert.equal(p.stadium, null);
  assert.equal(p.summary.venueName, '臨時会場');
  assert.equal(p.train, mapsSearchUrl({ query: '臨時会場' }));
  assert.equal(p.car, mapsSearchUrl({ query: '臨時会場' }));
  assert.deepEqual(p.bus, { unsupported: true });
  assert.deepEqual(p.lodging.hotels, []);
  assert.equal(p.lodging.prefectureUrl, null);
  assert.equal(p.lodging.agodaUrl, agodaUrl({ area: null, checkIn: '2026-10-25', nights: 1 }));
  assert.equal(p.food, mapsSearchUrl({ query: restaurantQuery('臨時会場') }));
  assert.equal(p.tripDraft.title, 'unknown-club遠征'); // クラブの表にない相手は ID を名前にする
});

test('URL の手入力（会場だけ）：相手なし。遠征予定の名前は会場名', () => {
  const p = build('d=2026-12-06&k=19%3A00&v=長野Uスタジアム&m=train,car');
  assert.equal(p.summary.title, '長野Uスタジアム');
  assert.equal(p.train, mapsSearchUrl({ query: '長野Uスタジアム' }));
  assert.deepEqual(p.timeline.arrive, { date: '2026-12-06', time: '17:30' });
  assert.deepEqual(p.tripDraft, { fixture_id: null, custom_venue: '長野Uスタジアム', custom_date: '2026-12-06', title: '長野Uスタジアム遠征', modes: ['train', 'car'], lodging: 'none' });
});

test('URL の手入力（相手だけ）：相手のホームスタジアムが会場', () => {
  const p = build('o=gifu&d=2026-12-06&m=train');
  assert.equal(p.stadium, gifuStadium);
  assert.equal(p.summary.title, '松本山雅FC vs FC岐阜');
  assert.equal(p.summary.venueName, '長良川競技場');
  assert.equal(p.timeline.arrive, null);
  assert.equal(p.train, yahooTransitUrl({ from: '松本', to: '名鉄岐阜', date: '2026-12-06', arriveTime: null }));
  assert.deepEqual(p.tripDraft, { fixture_id: null, custom_venue: '長良川競技場', custom_date: '2026-12-06', title: '岐阜遠征', modes: ['train'], lodging: 'none' });
});

test('会場が分からない試合：会場未定で、経路・飲食店は出さない（落ちない）', () => {
  const p = build('f=NOVENUE&m=train,car,bus,plane&l=post');
  assert.equal(p.summary.venueName, '会場未定');
  assert.equal(p.venueUnknown, true);
  assert.deepEqual([p.train, p.car, p.food], [null, null, null]);
  assert.deepEqual(p.bus, { unsupported: true });
  assert.equal(p.flight.noAirport, true);
  assert.equal(p.lodging.prefectureUrl, null);
});

test('最寄り空港あり・日帰り：着陸目標 11:20、空港→スタジアムと出発地→空港', () => {
  const f = build('f=OKA&m=plane').flight;
  assert.equal(f.noAirport, undefined);
  assert.deepEqual(f.landingTarget, { date: '2026-11-22', time: '11:20' });
  assert.deepEqual(f.returnDepartAfter, { date: '2026-11-22', time: '17:50' });
  assert.equal(f.arrivalAirport.iata, 'OKA');
  assert.equal(f.skyscanner[0].url, skyscannerUrl({ from: 'MMJ', to: 'OKA', outbound: '2026-11-22', inbound: '2026-11-22' }));
  // 空港 → スタジアム：空港に駅があるので乗換案内（到着時刻＝到着目標）
  assert.deepEqual(f.fromAirport, {
    url: yahooTransitUrl({ from: '那覇空港', to: '沖縄市', date: '2026-11-22', arriveTime: '12:30' }),
    note: 'ゆいレール＋路線バス',
  });
  // 出発地 → 出発空港：駅なし（MMJ）は Googleマップ検索、駅あり（NGO）は乗換案内（時刻指定なし）
  assert.deepEqual(f.toAirport, [
    { code: 'MMJ', url: mapsSearchUrl({ query: '信州まつもと空港' }), note: '松本駅からバス・タクシー' },
    { code: 'NGO', url: yahooTransitUrl({ from: '松本', to: '中部国際空港', date: '2026-11-22', arriveTime: null }), note: '特急しなの＋名鉄' },
  ]);
});

test('飛行機：後泊は復路が翌日。空港に駅がなければ Googleマップ（公共交通）', () => {
  const noStation = { ...masters, stadiumsById: { ...masters.stadiumsById, hiyagon: { ...hiyagon, airports: [{ ...hiyagon.airports[0], station: null, note: null }] } } };
  const f = build('f=OKA&m=plane&l=post', { masters: noStation }).flight;
  assert.equal(f.skyscanner[1].url, skyscannerUrl({ from: 'NGO', to: 'OKA', outbound: '2026-11-22', inbound: '2026-11-23' }));
  assert.equal(f.returnNote, 'nextDay');
  assert.deepEqual(f.fromAirport, { url: mapsDirectionsUrl({ origin: '那覇空港', lat: 26.3, lng: 127.8, travelmode: 'transit' }), note: null });
});

test('飛行機：前泊の往路は前日の日付', () => {
  const f = build('f=OKA&m=plane&l=pre').flight;
  assert.equal(f.landingNote, 'prevDay');
  assert.equal(f.skyscanner[0].url, skyscannerUrl({ from: 'MMJ', to: 'OKA', outbound: '2026-11-21', inbound: '2026-11-22' }));
  assert.equal(f.toAirport[1].url, yahooTransitUrl({ from: '松本', to: '中部国際空港', date: '2026-11-21', arriveTime: null }));
});

test('見つからない試合は not_found', () => {
  assert.deepEqual(build('f=nope'), { error: 'not_found' });
  assert.deepEqual(build('o=gifu&m=train'), { error: 'not_found' }); // 日付がない手入力
  assert.deepEqual(buildResultPage({ query: null, masters, settings: SETTINGS, supportClubId: 'matsumoto' }), { error: 'not_found' });
});

test('遠征予定の名前は50文字まで', () => {
  const p = build(`d=2026-12-06&v=${'あ'.repeat(60)}&m=train`);
  assert.equal([...p.tripDraft.title].length, 50);
});
