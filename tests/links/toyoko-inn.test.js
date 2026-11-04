import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOYOKO_PREFECTURE_CODES, toyokoHotelUrl, toyokoPrefectureUrl, parseToyokoHotelId, toyokoHotelsForStations } from '../../src/core/links/toyoko-inn.js';

test('都道府県コードは JIS 1〜47', () => {
  assert.equal(Object.keys(TOYOKO_PREFECTURE_CODES).length, 47);
  assert.equal(TOYOKO_PREFECTURE_CODES['北海道'], 1);
  assert.equal(TOYOKO_PREFECTURE_CODES['岐阜県'], 21);
  assert.equal(TOYOKO_PREFECTURE_CODES['沖縄県'], 47);
  assert.deepEqual(Object.values(TOYOKO_PREFECTURE_CODES).sort((a, b) => a - b), Array.from({ length: 47 }, (_, i) => i + 1));
});
test('ホテルのURL', () => {
  assert.equal(toyokoHotelUrl({ hotel: '00298', checkIn: '2026-11-21', checkOut: '2026-11-22' }),
    'https://www.toyoko-inn.com/search/result/room_plan/?hotel=00298&people=1&room=1&smoking=noSmoking&start=2026-11-21&end=2026-11-22');
});
test('都道府県のURL。表にない県は null', () => {
  assert.equal(toyokoPrefectureUrl({ prefecture: '岐阜県', checkIn: '2026-11-21', checkOut: '2026-11-22' }),
    'https://www.toyoko-inn.com/search/result/?prefecture=21&people=1&room=1&smoking=noSmoking&start=2026-11-21&end=2026-11-22');
  assert.equal(toyokoPrefectureUrl({ prefecture: '架空県', checkIn: '2026-11-21', checkOut: '2026-11-22' }), null);
});
test('URLからホテルIDを読む', () => {
  for (const u of ['https://www.toyoko-inn.com/search/detail/00298/', 'https://toyoko-inn.com/search/detail/00298', 'https://www.toyoko-inn.com/eng/search/detail/00298/'])
    assert.equal(parseToyokoHotelId(u), '00298');
  assert.equal(parseToyokoHotelId('https://www.toyoko-inn.com/search/detail/abc/'), null);
  assert.equal(parseToyokoHotelId('https://www.toyoko-inn.com/search/detail/0029/'), null);
  assert.equal(parseToyokoHotelId('https://example.com/search/detail/00298/'), null);
});
test('駅ごとのホテル：駅の順、同じ店は最初の駅だけ', () => {
  assert.deepEqual(toyokoHotelsForStations([
    { name: '岐阜', kind: 'nearest', toyoko: [{ hotel: '00123', name: '東横INN岐阜', walk_min: 3 }] },
    { name: '名鉄岐阜', kind: 'shuttle', toyoko: [{ hotel: '00123', name: '東横INN岐阜', walk_min: 5 }, { hotel: '00456', name: '東横INN別館', walk_min: 7 }] },
  ]), [
    { hotel: '00123', name: '東横INN岐阜', walk_min: 3, station: '岐阜', kind: 'nearest' },
    { hotel: '00456', name: '東横INN別館', walk_min: 7, station: '名鉄岐阜', kind: 'shuttle' },
  ]);
  assert.deepEqual(toyokoHotelsForStations([{ name: 'A', kind: 'nearest' }]), []);
});
