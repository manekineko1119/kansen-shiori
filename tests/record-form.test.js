import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  recordFromForm, fixtureEditFromForm, validateFixtureEdit, validateMatchRecord, costTotal, recordFormValues,
  fixtureFormValues, removeScorerRow, scorerRowIndexes, youtubeId, thumbnailUrl, sourceLabel, videoSaves,
} from '../src/core/record-form.js';
import { formatDateTimeJst } from '../src/core/format.js';

test('recordFromForm：全角・カンマ・空・数字でない値・メモの空白', () => {
  assert.deepEqual(
    recordFromForm({ watch_style: 'stadium', cost_transport: '１，２００', cost_lodging: '', cost_ticket: '3500', cost_goods: 'abc', cost_food: '0', memo: '  良い試合 ' }),
    { watch_style: 'stadium', cost_transport: 1200, cost_lodging: null, cost_ticket: 3500, cost_goods: NaN, cost_food: 0, memo: '良い試合' });
  assert.equal(recordFromForm({ watch_style: 'stadium', cost_ticket: '1,200' }).cost_ticket, 1200);
  assert.equal(recordFromForm({ watch_style: 'stadium', memo: ' ' }).memo, null);
  assert.ok(Number.isNaN(recordFromForm({ watch_style: 'stadium', cost_food: '-5' }).cost_food));
});

test('費用が数字でなければ検証で止まる。全角は通る', () => {
  assert.equal(validateMatchRecord(recordFromForm({ watch_style: 'stadium', cost_goods: 'abc' })).errors.cost_goods, '費用は0以上の整数で入力してください');
  assert.equal(validateMatchRecord(recordFromForm({ watch_style: 'stadium', cost_goods: '１，２００' })).ok, true);
});

test('費用の合計：空と NaN は 0 として足さない', () => {
  assert.equal(costTotal({ cost_transport: 1200, cost_lodging: null, cost_ticket: 3500, cost_goods: NaN, cost_food: 0 }), 4700);
  assert.equal(costTotal(recordFromForm({ watch_style: 'stadium' })), 0);
});

test('recordFormValues：なければ空と「現地」。数は文字列', () => {
  assert.deepEqual(recordFormValues(null), { watch_style: 'stadium', memo: '', cost_transport: '', cost_lodging: '', cost_ticket: '', cost_goods: '', cost_food: '' });
  assert.deepEqual(recordFormValues({ watch_style: 'broadcast', cost_transport: 9800, cost_food: 0, memo: 'x' }),
    { watch_style: 'broadcast', memo: 'x', cost_transport: '9800', cost_lodging: '', cost_ticket: '', cost_goods: '', cost_food: '0' });
});

const edit = fixtureEditFromForm({
  status: 'finished', home_score: '1', away_score: '3',
  scorer_0_side: 'home', scorer_0_player: '田中 太一', scorer_0_minute: '64', scorer_0_type: 'goal',
  scorer_1_side: 'away', scorer_1_player: '', scorer_1_minute: '', scorer_1_type: 'goal',
  video_highlight: 'https://www.youtube.com/watch?v=abc', video_inside: '',
});
const ids = { homeClubId: 'nara', awayClubId: 'matsumoto' };

test('fixtureEditFromForm：名前が空の得点者の行は捨てる。動画の空は null', () => {
  assert.deepEqual(edit.fixture.scorers, [{ side: 'home', player: '田中 太一', minute: '64', type: 'goal' }]);
  assert.deepEqual(edit.videos, { highlight: 'https://www.youtube.com/watch?v=abc', inside: null });
  assert.deepEqual([edit.fixture.status, edit.fixture.home_score, edit.fixture.away_score], ['finished', 1, 3]);
});

test('validateFixtureEdit：スコア・時間・動画の URL', () => {
  assert.equal(validateFixtureEdit(edit, ids).ok, true);
  assert.equal(validateFixtureEdit({ ...edit, fixture: { ...edit.fixture, home_score: null } }, ids).errors.home_score, 'スコアを入力してください');
  assert.ok(validateFixtureEdit({ ...edit, fixture: { ...edit.fixture, away_score: -1 } }, ids).errors.away_score);
  assert.ok(validateFixtureEdit({ ...edit, videos: { highlight: 'https://evil.example/', inside: null } }, ids).errors.video_highlight);
  assert.ok(validateFixtureEdit({ ...edit, videos: { highlight: null, inside: 'https://youtu.be/x' } }, ids).ok);
  assert.ok(validateFixtureEdit({ ...edit, fixture: { ...edit.fixture, scorers: [{ side: 'home', player: 'a', minute: '45+x', type: 'goal' }] } }, ids).errors['scorers.0.minute']);
  assert.equal(validateFixtureEdit({ ...edit, fixture: { ...edit.fixture, scorers: [{ side: 'home', player: 'a', minute: '90+2', type: 'penalty' }] } }, ids).ok, true);
});

test('validateFixtureEdit：延期はスコアなしで通る。壊れた数・状態は止める', () => {
  const blank = { videos: { highlight: null, inside: null } };
  assert.equal(validateFixtureEdit({ fixture: { status: 'postponed', home_score: null, away_score: null, scorers: [] }, ...blank }, ids).ok, true);
  assert.ok(validateFixtureEdit({ fixture: { status: 'postponed', home_score: NaN, away_score: null, scorers: [] }, ...blank }, ids).errors.home_score);
  assert.ok(validateFixtureEdit({ fixture: { status: 'zzz', home_score: null, away_score: null, scorers: [] }, ...blank }, ids).errors.status);
});

test('PK戦：入力欄 ↔ 保存する値', () => {
  const v = fixtureFormValues({ status: 'finished', home_score: 1, away_score: 1, home_pk: 4, away_pk: 3 });
  assert.deepEqual([v.home_pk, v.away_pk], ['4', '3']);
  const none = fixtureFormValues({ status: 'finished', home_score: 1, away_score: 0 });
  assert.deepEqual([none.home_pk, none.away_pk], ['', '']);
  const e = fixtureEditFromForm({ status: 'finished', home_score: '1', away_score: '1', home_pk: '4', away_pk: '' });
  assert.deepEqual([e.fixture.home_pk, e.fixture.away_pk], [4, null]);
});

test('validateFixtureEdit：PK戦（両方・同じ数でない・同点のときだけ・0以上の整数）', () => {
  const draw = { ...edit.fixture, home_score: 1, away_score: 1 };
  const v = (pk, fx = draw) => validateFixtureEdit({ ...edit, fixture: { ...fx, ...pk } }, ids);
  assert.equal(v({ home_pk: 4, away_pk: 3 }).ok, true);
  assert.equal(v({ home_pk: null, away_pk: null }).ok, true);
  assert.equal(v({ home_pk: 4, away_pk: null }).errors.away_pk, 'PK戦は両方のスコアを入れてください');
  assert.equal(v({ home_pk: null, away_pk: 3 }).errors.away_pk, 'PK戦は両方のスコアを入れてください');
  assert.equal(v({ home_pk: 3, away_pk: 3 }).errors.home_pk, 'PK戦のスコアが同じです');
  assert.equal(v({ home_pk: 4, away_pk: 3 }, edit.fixture).errors.home_pk, 'PK戦はスコアが同点のときだけ入れられます');
  assert.equal(v({ status: 'scheduled', home_pk: 4, away_pk: 3 }).errors.home_pk, 'PK戦はスコアが同点のときだけ入れられます');
  assert.equal(v({ home_pk: -1, away_pk: 3 }).errors.home_pk, '0以上の整数で入力してください');
  assert.equal(v({ home_pk: 4, away_pk: NaN }).errors.away_pk, '0以上の整数で入力してください');
});

test('得点者の行：初期値は club_id から側へ。行の削除は後ろを詰める。元の行の番号に戻せる', () => {
  const f = {
    status: 'finished', home_club_id: 'nara', away_club_id: 'matsumoto', home_score: 1, away_score: 2,
    scorers: [{ club_id: 'nara', player: 'A', minute: '5', type: 'goal' }, { club_id: 'matsumoto', player: 'B', minute: '60', type: 'penalty' }],
    fixture_videos: [{ kind: 'inside', url: 'https://youtu.be/x', source: 'api' }],
  };
  const v = fixtureFormValues(f);
  assert.deepEqual([v.scorer_0_side, v.scorer_1_side, v.scorer_1_type, v.scorer_count, v.video_inside, v.video_highlight], ['home', 'away', 'penalty', '2', 'https://youtu.be/x', '']);
  const r = removeScorerRow(v, 0);
  assert.deepEqual([r.scorer_0_player, r.scorer_0_side, r.scorer_1_player, r.scorer_count], ['B', 'away', undefined, '1']);
  assert.deepEqual(scorerRowIndexes({ scorer_0_player: '', scorer_1_player: 'x', scorer_2_player: ' ', scorer_3_player: 'y' }), [1, 3]);
});

test('youtubeId：watch?v= と youtu.be/。取り出せなければ null', () => {
  assert.equal(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s'), 'dQw4w9WgXcQ');
  assert.equal(youtubeId('https://youtu.be/dQw4w9WgXcQ?t=5'), 'dQw4w9WgXcQ');
  assert.equal(youtubeId('https://www.youtube.com/playlist?list=x'), null);
  assert.equal(youtubeId('https://evil.example/watch?v=abc'), null);
  assert.equal(youtubeId('https://youtu.be/a"b'), null);
  assert.equal(youtubeId('not a url'), null);
  assert.equal(thumbnailUrl('abc'), 'https://i.ytimg.com/vi/abc/mqdefault.jpg');
});

test('出どころの文と日本時間の更新日時', () => {
  assert.equal(sourceLabel({ result_source: 'manual' }), '手入力');
  assert.equal(sourceLabel({ result_source: 'api' }), 'Jリーグ公式から自動');
  assert.equal(sourceLabel({ result_source: null }), null);
  assert.equal(formatDateTimeJst('2026-10-25T21:05:00+00:00'), '2026/10/26 6:05');
  assert.equal(formatDateTimeJst('2026-12-31T15:00:00Z'), '2027/1/1 0:00');
  assert.equal(formatDateTimeJst('x'), null);
});

import { scorerRows, addScorerRow } from '../src/core/record-form.js';

test('得点者の行：DB に2件 → 1件目を削除 → 追加 で [2件目, 空]。消した行の値は戻らない', () => {
  const f = {
    home_club_id: 'nara', away_club_id: 'matsumoto',
    scorers: [{ club_id: 'nara', player: 'A', minute: '5', type: 'goal' }, { club_id: 'matsumoto', player: 'B', minute: '60', type: 'penalty' }],
  };
  const initial = fixtureFormValues(f);
  assert.deepEqual(scorerRows(initial, {}).map((r) => r.player), ['A', 'B']);
  const removed = removeScorerRow(initial, 0);
  assert.deepEqual(scorerRows(initial, removed).map((r) => r.player), ['B']);
  const added = addScorerRow(removed);
  assert.deepEqual(scorerRows(initial, added), [
    { side: 'away', player: 'B', minute: '60', type: 'penalty' },
    { side: 'home', player: '', minute: '', type: 'goal' },
  ]);
});

test('得点者の行：DB が1件だけでも、削除 → 追加で消した名前は戻らない。何も保存されていなければ DB の値', () => {
  const initial = fixtureFormValues({ home_club_id: 'n', away_club_id: 'm', scorers: [{ club_id: 'n', player: 'A', minute: '5', type: 'goal' }] });
  const added = addScorerRow(removeScorerRow(initial, 0));
  assert.deepEqual(scorerRows(initial, added), [{ side: 'home', player: '', minute: '', type: 'goal' }]);
  assert.equal(scorerRows(initial, {}).length, 1);
});

// ---- 試合の情報の編集で、変えていない動画は書き込まない（6-6 のブラウザ確認で見つけた。2026-11-13）----

test('videoSaves：URL が今と同じ種類は keep（自動の動画を手入力に変えない）。違えば upsert、空なら remove', () => {
  const current = [
    { kind: 'highlight', url: 'https://www.youtube.com/watch?v=H', source: 'api' },
    { kind: 'inside', url: 'https://www.youtube.com/watch?v=I', source: 'api' },
  ];
  assert.deepEqual(videoSaves({ highlight: 'https://www.youtube.com/watch?v=H', inside: 'https://www.youtube.com/watch?v=I' }, current),
    [{ kind: 'highlight', action: 'keep', url: 'https://www.youtube.com/watch?v=H' }, { kind: 'inside', action: 'keep', url: 'https://www.youtube.com/watch?v=I' }]);
  assert.deepEqual(videoSaves({ highlight: 'https://youtu.be/new', inside: null }, current),
    [{ kind: 'highlight', action: 'upsert', url: 'https://youtu.be/new' }, { kind: 'inside', action: 'remove', url: null }]);
});

test('videoSaves：今の動画がない・渡されないときは、URL があれば upsert', () => {
  assert.deepEqual(videoSaves({ highlight: 'https://youtu.be/a', inside: null }, undefined),
    [{ kind: 'highlight', action: 'upsert', url: 'https://youtu.be/a' }, { kind: 'inside', action: 'remove', url: null }]);
});
