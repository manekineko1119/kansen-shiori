import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchDefaults, queryFromForm, historyLabel, formFromQuery, fixtureLabel, upcomingFixtures, ticketInfo, opponentGroups } from '../src/core/search-form.js';
import { parseResultQuery } from '../src/core/search-query.js';

const clubsById = {
  matsumoto: { id: 'matsumoto', name: '松本山雅FC', short_name: '松本', home_stadium_id: 'alwin' },
  gifu: { id: 'gifu', name: 'FC岐阜', short_name: '岐阜', home_stadium_id: 'gifu-memorial' },
};
const stadiumsById = { 'gifu-memorial': { id: 'gifu-memorial', name: '長良川競技場' } };
const x = { id: 'x', match_date: '2026-10-25', kickoff: '14:00', home_club_id: 'gifu', away_club_id: 'matsumoto', competition: 'J3', round: '12', status: 'scheduled' };
const ctxH = { fixturesById: { x }, clubsById, supportClubId: 'matsumoto' };

test('検索の初期値は設定の交通手段・日帰り・設定の出発地', () => {
  assert.deepEqual(searchDefaults({ default_modes: ['train', 'bus'] }), { kind: 'fixture', fixtureId: null, modes: ['train', 'bus'], lodging: 'none', origin: 'settings' });
});

test('日程から選んだ試合の条件 → URL', () => {
  const base = { kind: 'fixture', fixtureId: '2026-27_J3_12_gifu_matsumoto', modes: ['train'], lodging: 'post', origin: 'settings' };
  assert.deepEqual(queryFromForm(base), { ok: true, qs: 'f=2026-27_J3_12_gifu_matsumoto&m=train&l=post' });
  assert.deepEqual(queryFromForm({ ...base, fixtureId: '' }).errors, { fixtureId: '試合を選んでください' });
  assert.deepEqual(queryFromForm({ ...base, modes: [] }).errors, { modes: '交通手段を1つ以上選んでください' });
});

test('手入力の試合の条件 → URL と、項目ごとの理由', () => {
  const custom = { kind: 'custom', opponentId: 'gifu', date: '2026-12-06', kickoff: '', venue: '', modes: ['car'], lodging: 'none', origin: 'here' };
  assert.deepEqual(queryFromForm(custom), { ok: true, qs: 'o=gifu&d=2026-12-06&m=car&here=1' });
  assert.deepEqual(queryFromForm({ ...custom, date: '2026-02-30' }).errors, { date: '日付を入力してください' });
  assert.deepEqual(queryFromForm({ ...custom, opponentId: '', venue: '' }).errors, { opponentId: '対戦相手か会場を入力してください' });
  assert.deepEqual(queryFromForm({ ...custom, opponentId: '', venue: '長野Uスタジアム', kickoff: '１９：００' }), { ok: true, qs: 'd=2026-12-06&k=19%3A00&v=%E9%95%B7%E9%87%8EU%E3%82%B9%E3%82%BF%E3%82%B8%E3%82%A2%E3%83%A0&m=car&here=1' });
  assert.deepEqual(queryFromForm({ ...custom, kickoff: '25:00' }).errors, { kickoff: 'キックオフは 19:00 の形で入力してください' });
});

test('検索履歴の表示名', () => {
  assert.equal(historyLabel('f=x&m=train,bus&l=post', ctxH), '10/25（日） A 岐阜・電車・高速バス・後泊');
  assert.equal(historyLabel('f=nope&m=train', ctxH), '試合の情報なし・電車');
  assert.equal(historyLabel('o=gifu&d=2026-12-06&m=car&here=1', ctxH), '12/6（日） 岐阜・車・現在地から');
  assert.equal(historyLabel('d=2026-12-06&v=長野Uスタジアム&m=plane&l=both', ctxH), '12/6（日） 長野Uスタジアム・飛行機・前泊＋後泊');
  assert.equal(historyLabel('zzz', ctxH), '条件を読み取れません');
});

test('日程の選択肢は今日以降の応援クラブの試合（中止・延期を除く）', () => {
  const fx = [
    { ...x, id: 'late', match_date: '2026-11-08' },
    { ...x, id: 'past', match_date: '2026-10-11' },
    { ...x, id: 'today', match_date: '2026-10-25', kickoff: null },
    { ...x, id: 'other', home_club_id: 'a', away_club_id: 'b' },
    { ...x, id: 'ppd', status: 'postponed' },
  ];
  assert.deepEqual(upcomingFixtures(fx, 'matsumoto', '2026-10-25').map((f) => f.id), ['today', 'late']);
  assert.equal(fixtureLabel(x, ctxH), '10/25（日） A 岐阜');
});

test('きっぷの文字', () => {
  const env = { clubsById, stadiumsById, supportClubId: 'matsumoto', originStation: '松本', today: '2026-10-19' };
  assert.deepEqual(ticketInfo(x, env), {
    kicker: '次のアウェイ戦　明治安田J3リーグ 第12節', from: '松本', to: '岐阜', vs: 'FC岐阜 vs 松本山雅FC',
    where: '10/25（日）長良川競技場', kickoff: '14:00', days: 'あと6日',
  });
  assert.equal(ticketInfo({ ...x, kickoff: null }, env).kickoff, 'キックオフ未定');
  assert.equal(ticketInfo(x, { ...env, today: '2026-10-25' }).days, '今日');
  assert.equal(ticketInfo({ ...x, home_club_id: 'zz' }, env).where, '10/25（日）会場未定');
});

test('結果画面の条件 → 検索画面の入力欄の値', () => {
  assert.deepEqual(formFromQuery(parseResultQuery('f=x&m=train,bus&l=post')), {
    kind: 'fixture', fixtureId: 'x', opponentId: '', date: '', kickoff: '', venue: '',
    mode_train: true, mode_car: false, mode_bus: true, mode_plane: false, lodging: 'post', origin: 'settings',
  });
  const custom = formFromQuery(parseResultQuery('o=gifu&d=2026-12-06&k=19%3A00&v=長野Uスタジアム&m=car&here=1'));
  assert.deepEqual([custom.kind, custom.fixtureId, custom.opponentId, custom.date, custom.kickoff, custom.venue, custom.origin],
    ['custom', '', 'gifu', '2026-12-06', '19:00', '長野Uスタジアム', 'here']);
});

// 手入力の対戦相手（設計書 3.1）：応援クラブと同じ大会を先頭に、ほかの大会も大会ごとにまとめる（カップ戦で J1・J2 のクラブとも当たるため）
const oc = (id, name) => ({ id, name });
const ogClubs = [oc('j1a', 'J1のA'), oc('j2a', 'J2のA'), oc('matsumoto', '松本山雅FC'), oc('j3a', 'J3のA'), oc('j1b', 'J1のB'), oc('free', '所属なし')];
const ogSeason = [
  { competition: 'J1', club_id: 'j1a' }, { competition: 'J1', club_id: 'j1b' },
  { competition: 'J2', club_id: 'j2a' }, { competition: 'J3', club_id: 'matsumoto' }, { competition: 'J3', club_id: 'j3a' },
];
const ids = (groups) => groups.map((g) => [g.label, g.clubs.map((c) => c.id)]);

test('対戦相手は、応援クラブと同じ大会が先頭、残りは J1・J2・J3 の順、所属のないクラブは最後の「その他」', () => {
  assert.deepEqual(ids(opponentGroups({ clubs: ogClubs, seasonClubs: ogSeason, supportClubId: 'matsumoto' })),
    [['J3', ['j3a']], ['J1', ['j1a', 'j1b']], ['J2', ['j2a']], ['その他', ['free']]]);
});

test('対戦相手に応援クラブ自身は入れない', () => {
  const all = opponentGroups({ clubs: ogClubs, seasonClubs: ogSeason, supportClubId: 'j1a' }).flatMap((g) => g.clubs.map((c) => c.id));
  assert.ok(!all.includes('j1a'));
  assert.deepEqual(ids(opponentGroups({ clubs: ogClubs, seasonClubs: ogSeason, supportClubId: 'j1a' }))[0], ['J1', ['j1b']]);
});

test('応援クラブの所属が分からないとき・所属の表がないときは、J1・J2・J3・その他の順', () => {
  assert.deepEqual(ids(opponentGroups({ clubs: ogClubs, seasonClubs: ogSeason, supportClubId: 'free' })),
    [['J1', ['j1a', 'j1b']], ['J2', ['j2a']], ['J3', ['matsumoto', 'j3a']]]);
  assert.deepEqual(ids(opponentGroups({ clubs: ogClubs, seasonClubs: [], supportClubId: 'matsumoto' })),
    [['その他', ['j1a', 'j2a', 'j3a', 'j1b', 'free']]]);
});

test('クラブがないときは空、空の大会は出さない', () => {
  assert.deepEqual(opponentGroups({ clubs: [], seasonClubs: [], supportClubId: 'matsumoto' }), []);
  assert.deepEqual(ids(opponentGroups({ clubs: [oc('j3a', 'A')], seasonClubs: ogSeason, supportClubId: 'matsumoto' })), [['J3', ['j3a']]]);
});
