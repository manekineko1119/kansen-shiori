import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../src/config.js';

// アプリに置いてよい鍵は publishable 鍵だけ（設計書 11.1・12章 No.21）
test('publishable 鍵を使う', () => {
  assert.match(SUPABASE_PUBLISHABLE_KEY, /^sb_publishable_/);
});

test('secret 鍵・従来の鍵（JWT）を入れない', () => {
  assert.doesNotMatch(readFileSync(new URL('../src/config.js', import.meta.url), 'utf8'), /sb_secret_|eyJ/);
});

test('URL は Supabase のプロジェクトの URL', () => {
  assert.match(SUPABASE_URL, /^https:\/\/[a-z0-9]+\.supabase\.co$/);
});
