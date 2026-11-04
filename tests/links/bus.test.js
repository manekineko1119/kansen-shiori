import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUS_PREFECTURE_SLUGS, busSearchUrl, busLinks } from '../../src/core/links/bus.js';

test('対応表：サイトの選択肢の値', () => {
  assert.equal(BUS_PREFECTURE_SLUGS['長野県'], 'nagano');
  assert.equal(BUS_PREFECTURE_SLUGS['岐阜県'], 'gifu');
  assert.equal(BUS_PREFECTURE_SLUGS['東京都'], 'tokyo');
  assert.equal(BUS_PREFECTURE_SLUGS['神奈川県'], 'kanagawa');
  assert.equal(BUS_PREFECTURE_SLUGS['沖縄県'], undefined);
});

test('検索URL：出発県_到着県と日付', () => {
  assert.equal(busSearchUrl({ fromPrefecture: '長野県', toPrefecture: '岐阜県', date: '2026-11-21' }), 'https://www.bushikaku.net/search/nagano_gifu/20261121/');
});

test('検索URL：表にない県は null', () => {
  assert.equal(busSearchUrl({ fromPrefecture: '長野県', toPrefecture: '沖縄県', date: '2026-11-21' }), null);
  assert.equal(busSearchUrl({ fromPrefecture: '火星県', toPrefecture: '岐阜県', date: '2026-11-21' }), null);
});

test('3つのリンク：前日夜発は年をまたぐ', () => {
  assert.deepEqual(busLinks({ fromPrefecture: '長野県', toPrefecture: '岐阜県', matchDate: '2027-01-01' }), {
    outbound: 'https://www.bushikaku.net/search/nagano_gifu/20270101/',
    outboundNight: 'https://www.bushikaku.net/search/nagano_gifu/20261231/',
    inbound: 'https://www.bushikaku.net/search/gifu_nagano/20270101/',
  });
});

test('3つのリンク：月末の前日', () => {
  assert.equal(busLinks({ fromPrefecture: '東京都', toPrefecture: '岐阜県', matchDate: '2026-03-01' }).outboundNight, 'https://www.bushikaku.net/search/tokyo_gifu/20260228/');
});

test('表にない県は欄ごと出さない', () => {
  assert.equal(busLinks({ fromPrefecture: '長野県', toPrefecture: '沖縄県', matchDate: '2026-11-21' }), null);
});
