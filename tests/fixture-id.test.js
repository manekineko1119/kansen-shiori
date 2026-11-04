import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFixtureId, parseFixtureId } from '../src/core/fixture-id.js';

test('buildFixtureId: 節のある試合は「シーズン_大会_節_ホーム_アウェイ」になる', () => {
  assert.equal(
    buildFixtureId({ seasonId: '2026-27', competition: 'J3', round: '26', matchDate: '2027-03-13', homeClubId: 'matsumoto', awayClubId: 'nara' }),
    '2026-27_J3_26_matsumoto_nara',
  );
});

test('buildFixtureId: 節がない試合は、節の部分に日付 YYYYMMDD を入れる', () => {
  assert.equal(
    buildFixtureId({ seasonId: '2026-27', competition: 'FRIENDLY', round: null, matchDate: '2027-01-20', homeClubId: 'matsumoto', awayClubId: 'gifu' }),
    '2026-27_FRIENDLY_20270120_matsumoto_gifu',
  );
});

test('buildFixtureId: 空白だけの節は節なしとして扱う', () => {
  assert.equal(
    buildFixtureId({ seasonId: '2026-27', competition: 'J3', round: ' ', matchDate: '2027-01-20', homeClubId: 'matsumoto', awayClubId: 'gifu' }),
    '2026-27_J3_20270120_matsumoto_gifu',
  );
});

test('buildFixtureId: 節の前後の空白は取る', () => {
  assert.equal(
    buildFixtureId({ seasonId: '2026-27', competition: 'LEVAIN', round: ' 2回戦 ', matchDate: '2027-01-20', homeClubId: 'matsumoto', awayClubId: 'gifu' }),
    '2026-27_LEVAIN_2回戦_matsumoto_gifu',
  );
});

test('buildFixtureId: どの部分も _ を含むと例外になる', () => {
  assert.throws(() => buildFixtureId({ seasonId: '2026-27', competition: 'J3', round: '1_2', matchDate: '2027-01-20', homeClubId: 'matsumoto', awayClubId: 'gifu' }));
  assert.throws(() => buildFixtureId({ seasonId: '2026_27', competition: 'J3', round: '26', matchDate: '2027-01-20', homeClubId: 'matsumoto', awayClubId: 'gifu' }));
  assert.throws(() => buildFixtureId({ seasonId: '2026-27', competition: 'J3', round: '26', matchDate: '2027-01-20', homeClubId: 'matsu_moto', awayClubId: 'gifu' }));
  assert.throws(() => buildFixtureId({ seasonId: '2026-27', competition: 'J3', round: '26', matchDate: '2027-01-20', homeClubId: 'matsumoto', awayClubId: 'gi_fu' }));
});

test('buildFixtureId: 空の部分があれば例外になる', () => {
  assert.throws(() => buildFixtureId({ seasonId: '', competition: 'J3', round: '26', matchDate: '2027-01-20', homeClubId: 'matsumoto', awayClubId: 'gifu' }));
  assert.throws(() => buildFixtureId({ seasonId: '2026-27', competition: 'J3', round: '26', matchDate: '2027-01-20', homeClubId: 'matsumoto', awayClubId: '' }));
});

test('buildFixtureId: 数字の節（26）は文字列の節として使う（日付にしない）', () => {
  assert.equal(
    buildFixtureId({ seasonId: '2026-27', competition: 'J3', round: 26, matchDate: '2027-03-13', homeClubId: 'matsumoto', awayClubId: 'nara' }),
    '2026-27_J3_26_matsumoto_nara',
  );
});

test('buildFixtureId: 節が null・undefined・空白だけのときは日付を使う', () => {
  assert.equal(
    buildFixtureId({ seasonId: '2026-27', competition: 'J3', round: undefined, matchDate: '2027-03-13', homeClubId: 'matsumoto', awayClubId: 'nara' }),
    '2026-27_J3_20270313_matsumoto_nara',
  );
  assert.equal(
    buildFixtureId({ seasonId: '2026-27', competition: 'J3', round: '\t ', matchDate: '2027-03-13', homeClubId: 'matsumoto', awayClubId: 'nara' }),
    '2026-27_J3_20270313_matsumoto_nara',
  );
});

test('buildFixtureId: 節が文字列・数字・null以外の型なら例外になる', () => {
  assert.throws(() => buildFixtureId({ seasonId: '2026-27', competition: 'J3', round: { no: 26 }, matchDate: '2027-03-13', homeClubId: 'matsumoto', awayClubId: 'nara' }));
  assert.throws(() => buildFixtureId({ seasonId: '2026-27', competition: 'J3', round: true, matchDate: '2027-03-13', homeClubId: 'matsumoto', awayClubId: 'nara' }));
});

test('buildFixtureId: 日付で代える場合、試合日は YYYY-MM-DD でなければ例外になる', () => {
  assert.throws(() => buildFixtureId({ seasonId: '2026-27', competition: 'FRIENDLY', round: null, matchDate: '2027/01/20', homeClubId: 'matsumoto', awayClubId: 'gifu' }));
  assert.throws(() => buildFixtureId({ seasonId: '2026-27', competition: 'FRIENDLY', round: '', matchDate: '20270120', homeClubId: 'matsumoto', awayClubId: 'gifu' }));
  assert.throws(() => buildFixtureId({ seasonId: '2026-27', competition: 'FRIENDLY', round: ' ', matchDate: '2027-1-20', homeClubId: 'matsumoto', awayClubId: 'gifu' }));
});

test('buildFixtureId: 節があるなら試合日の形は見ない', () => {
  assert.equal(
    buildFixtureId({ seasonId: '2026-27', competition: 'J3', round: '26', matchDate: '2027/03/13', homeClubId: 'matsumoto', awayClubId: 'nara' }),
    '2026-27_J3_26_matsumoto_nara',
  );
});

test('parseFixtureId: 5つの部分に分ける', () => {
  assert.deepEqual(parseFixtureId('2026-27_J3_26_matsumoto_nara'), {
    seasonId: '2026-27', competition: 'J3', roundOrDate: '26', homeClubId: 'matsumoto', awayClubId: 'nara',
  });
});

test('parseFixtureId: 節の部分に日付が入ったIDもそのまま返す', () => {
  assert.deepEqual(parseFixtureId('2026-27_FRIENDLY_20270120_matsumoto_gifu'), {
    seasonId: '2026-27', competition: 'FRIENDLY', roundOrDate: '20270120', homeClubId: 'matsumoto', awayClubId: 'gifu',
  });
});

test('parseFixtureId: 5つの部分に分けられない・空の部分があるなら null', () => {
  assert.equal(parseFixtureId('abc'), null);
  assert.equal(parseFixtureId(''), null);
  assert.equal(parseFixtureId('2026-27_J3_26_matsumoto'), null);
  assert.equal(parseFixtureId('2026-27_J3_26_matsumoto_nara_extra'), null);
  assert.equal(parseFixtureId('2026-27_J3__matsumoto_nara'), null);
  assert.equal(parseFixtureId('2026-27_J3_26_matsumoto_'), null);
});

test('build と parse は往復して元に戻る', () => {
  const id = buildFixtureId({ seasonId: '2026-27', competition: 'J3', round: '26', matchDate: '2027-03-13', homeClubId: 'matsumoto', awayClubId: 'nara' });
  assert.deepEqual(parseFixtureId(id), {
    seasonId: '2026-27', competition: 'J3', roundOrDate: '26', homeClubId: 'matsumoto', awayClubId: 'nara',
  });
});
