import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authErrorFromUrl, cleanAuthUrl, safeReturnTo, toAppUser } from '../src/core/auth-url.js';

const base = 'https://manekineko1119.github.io/kansen-shiori/';

test('authErrorFromUrl：招待されていない（クエリの access_denied）', () => {
  // 2026-11-08 に本番で確かめた形（設計書 7.1）。error_description の文は使わない
  assert.equal(
    authErrorFromUrl(`${base}?error=access_denied&error_code=&error_description=%E6%8B%9B%E5%BE%85#error=access_denied&error_description=%25E6`),
    'not_invited',
  );
});

test('authErrorFromUrl：ハッシュにだけ access_denied がある場合も招待されていない', () => {
  assert.equal(authErrorFromUrl(`${base}#error=access_denied`), 'not_invited');
});

test('authErrorFromUrl：ほかのエラーは failed', () => {
  assert.equal(authErrorFromUrl(`${base}?error=server_error`), 'failed');
});

test('authErrorFromUrl：エラーがなければ null。画面の条件の中の文字は見ない', () => {
  assert.equal(authErrorFromUrl(`${base}?code=abc#/trips`), null);
  assert.equal(authErrorFromUrl(`${base}#/result?f=x&error=1`), null);
  assert.equal(authErrorFromUrl(`${base}#/search`), null);
});

test('cleanAuthUrl：code・error などを取り除き、画面の # 以降は残す', () => {
  assert.equal(cleanAuthUrl(`${base}?code=abc#/trips`), `${base}#/trips`);
  assert.equal(cleanAuthUrl(`${base}?error=access_denied&error_code=&error_description=x#error=access_denied`), `${base}#/login`);
  assert.equal(cleanAuthUrl(`${base}#/result?f=x`), `${base}#/result?f=x`);
  assert.equal(cleanAuthUrl('http://localhost:8080/?code=abc&v=2#/search'), 'http://localhost:8080/?v=2#/search');
});

test('safeReturnTo：アプリの中の画面だけを戻り先にする', () => {
  assert.equal(safeReturnTo('#/trips/abc'), '#/trips/abc');
  assert.equal(safeReturnTo('#/result?f=x&l=post'), '#/result?f=x&l=post');
  for (const v of [null, undefined, '', 'https://evil.example/', '//evil.example', '#/login', '#/login?x=1', '#/welcome', 'javascript:alert(1)', 42]) {
    assert.equal(safeReturnTo(v), '#/search', String(v));
  }
});

test('toAppUser：app_metadata の role だけで管理者を決める', () => {
  assert.deepEqual(toAppUser({ id: 'u1', app_metadata: { role: 'admin' } }), { id: 'u1', isAdmin: true });
  // user_metadata は本人が書けるので見ない
  assert.deepEqual(toAppUser({ id: 'u2', app_metadata: {}, user_metadata: { role: 'admin' } }), { id: 'u2', isAdmin: false });
  assert.deepEqual(toAppUser({ id: 'u3' }), { id: 'u3', isAdmin: false });
  assert.equal(toAppUser(null), null);
});
