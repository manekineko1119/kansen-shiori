import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skyscannerUrl } from '../../src/core/links/skyscanner.js';

test('往復の日付つきURL（コードは小文字）', () => {
  assert.equal(skyscannerUrl({ from: 'NGO', to: 'OKA', outbound: '2026-11-21', inbound: '2026-11-23' }), 'https://www.skyscanner.jp/transport/flights/ngo/oka/261121/261123/');
});
test('年をまたぐ日付', () => {
  assert.equal(skyscannerUrl({ from: 'TYOA', to: 'OKA', outbound: '2026-12-31', inbound: '2027-01-01' }), 'https://www.skyscanner.jp/transport/flights/tyoa/oka/261231/270101/');
});
test('目的地が未登録（null）ならトップ', () => {
  assert.equal(skyscannerUrl({ from: 'NGO', to: null, outbound: '2026-11-21', inbound: '2026-11-23' }), 'https://www.skyscanner.jp/');
});
