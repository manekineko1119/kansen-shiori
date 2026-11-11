import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeFixtures, tripView, tripFormValues, tripFromForm, fixtureOptions } from '../src/core/trip-view.js';

const clubsById = {
  matsumoto: { id: 'matsumoto', name: '松本山雅FC', short_name: '松本' },
  gifu: { id: 'gifu', name: 'FC岐阜', short_name: '岐阜' },
  nara: { id: 'nara', name: '奈良クラブ', short_name: '奈良' },
  kanazawa: { id: 'kanazawa', name: 'ツエーゲン金沢', short_name: '金沢' },
};
const f1 = { id: 'f1', match_date: '2026-11-08', home_club_id: 'gifu', away_club_id: 'matsumoto' };
const f2 = { id: 'f2', match_date: '2026-11-15', home_club_id: 'matsumoto', away_club_id: 'nara' };
const other = { id: 'f3', match_date: '2026-11-22', home_club_id: 'nara', away_club_id: 'kanazawa' };
const old = { id: 'old_1', match_date: '2025-05-03', home_club_id: 'matsumoto', away_club_id: 'gifu' };
const ctx = (extra = []) => ({ fixturesById: mergeFixtures({ f1, f2, f3: other }, extra), clubsById, supportClubId: 'matsumoto' });

test('mergeFixtures：今のシーズンの試合が優先。extra だけの試合も引ける', () => {
  const m = mergeFixtures({ f1 }, [old, { ...f1, home_score: 9 }]);
  assert.deepEqual(Object.keys(m).sort(), ['f1', 'old_1']);
  assert.equal(m.f1.home_score, undefined);
});

test('tripView：試合あり（アウェイ・後泊）は日付の範囲と相手を出す', () => {
  const v = tripView({ id: 't', fixture_id: 'f1', title: '岐阜遠征', modes: ['train', 'bus'], lodging: 'post' }, ctx());
  assert.deepEqual([v.date, v.dateText, v.endText], ['2026-11-08', '11/8（日）', '11/9（月）']);
  assert.deepEqual([v.matchText, v.modesText, v.lodgingText], ['vs 岐阜', '電車・高速バス', '後泊']);
});

test('tripView：日帰りは endText なし。応援クラブが出ない試合は両方の名前', () => {
  const v = tripView({ fixture_id: 'f3', modes: [], lodging: 'none' }, ctx());
  assert.equal(v.endText, null);
  assert.equal(v.matchText, '奈良 vs 金沢');
  assert.equal(v.modesText, '交通手段未定');
});

test('tripView：試合が見つからないときは custom の会場・日付か「試合の情報なし」（D28）', () => {
  const a = tripView({ fixture_id: 'gone', custom_venue: '長良川', custom_date: '2026-11-08', modes: [], lodging: 'pre' }, ctx());
  assert.deepEqual([a.matchText, a.date, a.dateText, a.endText], ['長良川', '2026-11-08', '11/8（日）', '11/8（日）']);
  const b = tripView({ fixture_id: 'gone', modes: [], lodging: 'none' }, ctx());
  assert.deepEqual([b.matchText, b.date, b.dateText], ['試合の情報なし', null, '日付未定']);
  const c = tripView({ fixture_id: null, custom_venue: '駒沢', custom_date: '2026-12-01', modes: [], lodging: 'none' }, ctx());
  assert.deepEqual([c.matchText, c.dateText], ['駒沢', '12/1（火）']);
});

test('tripView：extraFixtures の試合（今のシーズンにない）も引ける', () => {
  const v = tripView({ fixture_id: 'old_1', modes: ['car'], lodging: 'none' }, ctx([old]));
  assert.deepEqual([v.matchText, v.dateText], ['vs 岐阜', '5/3（土）']);
});

test('tripFormValues / tripFromForm：往復できる。空欄は空文字', () => {
  const trip = { id: 't1', fixture_id: 'f1', custom_venue: null, custom_date: null, title: '岐阜遠征', modes: ['train', 'plane'], lodging: 'both', transport_memo: '特急', lodging_memo: null, memo: null };
  const form = tripFormValues(trip);
  assert.deepEqual(form, {
    title: '岐阜遠征', fixture_id: 'f1', custom_venue: '', custom_date: '',
    mode_train: true, mode_car: false, mode_bus: false, mode_plane: true,
    lodging: 'both', transport_memo: '特急', lodging_memo: '', memo: '',
  });
  assert.deepEqual(tripFromForm(form, 't1'), { id: 't1', fixture_id: 'f1', custom_venue: '', custom_date: '', title: '岐阜遠征', modes: ['train', 'plane'], lodging: 'both', transport_memo: '特急', lodging_memo: '', memo: '' });
  assert.equal('id' in tripFromForm(form, null), false);
  assert.equal(tripFromForm({ ...form, lodging: undefined }).lodging, 'none');
});

test('tripFormValues：下書き（結果画面の tripDraft）も同じ形にできる', () => {
  const form = tripFormValues({ fixture_id: null, custom_venue: '駒沢', custom_date: '2026-12-01', title: '駒沢遠征', modes: ['train'], lodging: 'none' });
  assert.deepEqual([form.fixture_id, form.custom_venue, form.custom_date, form.mode_train, form.mode_bus], ['', '駒沢', '2026-12-01', true, false]);
});

test('fixtureOptions：応援クラブの試合を日付順。選んでいる試合が欄外なら足す。なければ「試合の情報なし」', () => {
  const base = { supportClubId: 'matsumoto', clubsById };
  const all = mergeFixtures({ f2, f1, f3: other }, [old]);
  assert.deepEqual(fixtureOptions({ ...base, fixturesById: all, selectedId: null }).map((o) => o.value), ['old_1', 'f1', 'f2']);
  assert.equal(fixtureOptions({ ...base, fixturesById: all, selectedId: null })[1].label, '11/8（日） A 岐阜');
  assert.deepEqual(fixtureOptions({ ...base, fixturesById: all, selectedId: 'f3' }).map((o) => o.value), ['old_1', 'f1', 'f2', 'f3']);
  const gone = fixtureOptions({ ...base, fixturesById: all, selectedId: 'gone' }).at(-1);
  assert.deepEqual(gone, { value: 'gone', label: '試合の情報なし' });
});
