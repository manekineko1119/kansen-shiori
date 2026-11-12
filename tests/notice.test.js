import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNotice } from '../src/ui/notice.js';

test('ふつうのお知らせ：検索画面にいる間は残り、ほかの画面へ移ると消える', () => {
  const n = createNotice();
  n.set('ログアウトできませんでした');
  n.onNavigate('search');
  assert.equal(n.text, 'ログアウトできませんでした');
  n.onNavigate('trips');
  assert.equal(n.text, null);
});

test('survive 1：保存のあとの遷移では消えず、その次の遷移で消える（読み直せなかったお知らせ）', () => {
  const n = createNotice();
  n.set('読み直せませんでした', 1);
  n.onNavigate('admin'); // 保存のあとの navigate
  assert.equal(n.text, '読み直せませんでした');
  n.onNavigate('admin');
  assert.equal(n.text, null);
});

test('お知らせがないときの onNavigate は何もしない', () => {
  const n = createNotice();
  n.onNavigate('trips');
  assert.equal(n.text, null);
});
