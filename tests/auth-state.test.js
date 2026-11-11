import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authStateFrom } from '../src/core/auth-url.js';

// getSession の結果 → ログインの状態（未ログイン／ログイン中／確かめられない）。設計書 7章・9章
const admin = { id: 'u1', app_metadata: { role: 'admin' } };

test('セッションがあればログイン中', () => {
  assert.deepEqual(authStateFrom({ session: { user: admin }, error: null }), { status: 'signed_in', user: { id: 'u1', isAdmin: true } });
});

test('セッションがなく、エラーもなければ未ログイン', () => {
  assert.deepEqual(authStateFrom({ session: null, error: null }), { status: 'signed_out', user: null });
  assert.deepEqual(authStateFrom(undefined), { status: 'signed_out', user: null });
});

test('通信の失敗（期限切れ＋オフライン）は、未ログインとは扱わず「確かめられない」', () => {
  assert.deepEqual(authStateFrom({ session: null, error: { name: 'AuthRetryableFetchError', status: 0 } }), { status: 'unknown', user: null });
  assert.deepEqual(authStateFrom({ session: null, error: new TypeError('Failed to fetch') }), { status: 'unknown', user: null });
  assert.deepEqual(authStateFrom({ timedOut: true }), { status: 'unknown', user: null });
});

test('通信以外のエラー（更新の印が無効など）は未ログイン', () => {
  assert.deepEqual(authStateFrom({ session: null, error: { name: 'AuthApiError', status: 400 } }), { status: 'signed_out', user: null });
});
