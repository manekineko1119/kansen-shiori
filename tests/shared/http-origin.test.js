import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedOrigin, isClubId, CORS_ALLOW_HEADERS } from '../../supabase/functions/_shared/edge-auth.js';

test('allowedOrigin：GitHub Pages とローカルの確認（8080）だけ許す', () => {
  assert.equal(allowedOrigin('https://manekineko1119.github.io'), 'https://manekineko1119.github.io');
  assert.equal(allowedOrigin('http://localhost:8080'), 'http://localhost:8080');
});

test('allowedOrigin：ほかのオリジン・似た形・空は null', () => {
  for (const o of [null, undefined, '', 'null', 'https://example.com', 'http://manekineko1119.github.io', 'https://manekineko1119.github.io/',
    'https://manekineko1119.github.io.evil.test', 'https://evil.github.io', 'http://localhost:8000', 'http://127.0.0.1:8080', 'https://localhost:8080']) {
    assert.equal(allowedOrigin(o), null, String(o));
  }
});

test('CORS_ALLOW_HEADERS：x-cron-secret を入れない', () => {
  assert.equal(CORS_ALLOW_HEADERS, 'authorization, content-type, x-client-info, apikey');
  assert.equal(CORS_ALLOW_HEADERS.includes('x-cron-secret'), false);
});

test('isClubId：小文字の英数字とハイフンだけ', () => {
  assert.equal(isClubId('matsumoto'), true);
  assert.equal(isClubId('fc-tokyo2'), true);
  for (const v of ['', 'Matsumoto', 'a,b', 'x.eq.y', 'a b', 'matsumoto)', '松本', null, undefined, 1]) {
    assert.equal(isClubId(v), false, String(v));
  }
});
