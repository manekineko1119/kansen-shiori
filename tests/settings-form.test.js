import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settingsFromForm, airportRowIndexes, requiredErrors, MAX_AIRPORTS } from '../src/core/settings-form.js';
import { validateSettings } from '../src/core/validate.js';

const base = {
  support_club_id: 'matsumoto', origin_station: '松本', origin_prefecture: '長野県',
  origin_airports: [{ code: 'MMJ', name: '信州まつもと空港', station: null, access_min: 30, note: '' }],
  airport_checkin_min: 60, airport_arrival_min: 20, arrive_before_min: 90, default_modes: ['train'],
};

test('全角数字は半角にして整数にする', () => {
  const s = settingsFromForm({ airport_checkin_min: '３０', arrive_before_min: ' 45 ' }, base);
  assert.equal(s.airport_checkin_min, 30);
  assert.equal(s.arrive_before_min, 45);
  assert.equal(s.airport_arrival_min, 20); // 値がない項目は base のまま
});

test('整数にできない値は NaN のままにして、validateSettings が理由を出す', () => {
  const s = settingsFromForm({ airport_checkin_min: 'abc', airport_arrival_min: '', arrive_before_min: '1.5' }, base);
  assert.ok(Number.isNaN(s.airport_checkin_min));
  assert.ok(Number.isNaN(s.airport_arrival_min));
  assert.ok(Number.isNaN(s.arrive_before_min));
  const r = validateSettings(s);
  assert.equal(r.ok, false);
  assert.match(r.errors.airport_checkin_min, /0〜240分の整数/);
  assert.ok(r.errors.airport_arrival_min && r.errors.arrive_before_min);
});

test('出発駅・都道府県の前後の空白（全角も）を取る', () => {
  const s = settingsFromForm({ origin_station: '　松本 ', origin_prefecture: ' 長野県　', support_club_id: 'gifu' }, base);
  assert.equal(s.origin_station, '松本');
  assert.equal(s.origin_prefecture, '長野県');
  assert.equal(s.support_club_id, 'gifu');
});

test('空港の行：airport_count 件まで読み、コードが空の行は捨てる', () => {
  const values = {
    airport_count: '3',
    airport_0_code: ' mmj ', airport_0_name: ' 信州まつもと空港 ', airport_0_station: '', airport_0_access_min: '３０', airport_0_note: 'バス',
    airport_1_code: '', airport_1_name: '消える', airport_1_station: '', airport_1_access_min: '10', airport_1_note: '',
    airport_2_code: 'HND', airport_2_name: '羽田空港', airport_2_station: ' 羽田空港第1・第2ターミナル(京急) ', airport_2_access_min: '210', airport_2_note: '',
    airport_3_code: 'NGO', airport_3_name: 'count の外', airport_3_access_min: '1',
  };
  const s = settingsFromForm(values, base);
  assert.deepEqual(s.origin_airports, [
    { code: 'MMJ', name: '信州まつもと空港', station: null, access_min: 30, note: 'バス' },
    { code: 'HND', name: '羽田空港', station: '羽田空港第1・第2ターミナル(京急)', access_min: 210, note: '' },
  ]);
  assert.deepEqual(airportRowIndexes(values), [0, 2]); // 理由を出す行の番号に戻すため
});

test('空港の行の所要時間が数でなければ NaN（その行の理由が出る）', () => {
  const s = settingsFromForm({ airport_count: '1', airport_0_code: 'MMJ', airport_0_name: 'x', airport_0_access_min: 'abc' }, base);
  assert.ok(Number.isNaN(s.origin_airports[0].access_min));
  assert.ok(validateSettings(s).errors['origin_airports.0.access_min']);
});

test('空港は最大5件', () => {
  const values = { airport_count: '9' };
  for (let i = 0; i < 9; i += 1) Object.assign(values, { [`airport_${i}_code`]: 'MMJ', [`airport_${i}_access_min`]: '1' });
  assert.equal(MAX_AIRPORTS, 5);
  assert.equal(settingsFromForm(values, base).origin_airports.length, 5);
  assert.equal(airportRowIndexes(values).length, 5);
});

test('airport_count がなければ空港は base のまま。0 なら空', () => {
  assert.deepEqual(settingsFromForm({}, base).origin_airports, base.origin_airports);
  assert.deepEqual(settingsFromForm({ airport_count: '0' }, base).origin_airports, []);
});

test('交通手段のチェック：mode_* を電車・車・バス・飛行機の順に集める', () => {
  const s = settingsFromForm({ mode_train: true, mode_car: false, mode_bus: true, mode_plane: true }, base);
  assert.deepEqual(s.default_modes, ['train', 'bus', 'plane']);
  assert.deepEqual(settingsFromForm({ mode_train: false, mode_car: false, mode_bus: false, mode_plane: false }, base).default_modes, []);
  assert.deepEqual(settingsFromForm({}, base).default_modes, ['train']); // チェックの値がなければ base
});

test('requiredErrors：出発駅と都道府県が空ならエラー', () => {
  assert.deepEqual(requiredErrors(base), {});
  const e = requiredErrors({ ...base, origin_station: '', origin_prefecture: '' });
  assert.ok(e.origin_station && e.origin_prefecture);
});
