import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeHttpsUrl } from '../src/core/safe-url.js';

// 画面の XSS への備え（設計書 11.6・7-2b）

test('safeHttpsUrl：https の URL だけを通す', () => {
  assert.equal(safeHttpsUrl('https://www.jleague.jp/'), 'https://www.jleague.jp/');
  assert.equal(safeHttpsUrl('https://www.toyoko-inn.com/search/detail/00314/'), 'https://www.toyoko-inn.com/search/detail/00314/');
  assert.equal(safeHttpsUrl('javascript:alert(1)'), null);
  assert.equal(safeHttpsUrl('JaVaScRiPt:alert(1)'), null);
  assert.equal(safeHttpsUrl(' javascript:alert(1)'), null);
  assert.equal(safeHttpsUrl('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(safeHttpsUrl('http://example.com/'), null);
  assert.equal(safeHttpsUrl('//example.com/'), null);
  assert.equal(safeHttpsUrl('/relative'), null);
  assert.equal(safeHttpsUrl(''), null);
  assert.equal(safeHttpsUrl(null), null);
  assert.equal(safeHttpsUrl(undefined), null);
  assert.equal(safeHttpsUrl('https://user:pass@example.com/'), null);
});

// src/ の innerHTML・insertAdjacentHTML の右辺の ${…} は、許した定数だけ（DB・URL・入力の値を入れない）
const ALLOWED = new Set(['ICONS[key]', 'ICONS.settings', 'i']);
const srcDir = fileURLToPath(new URL('../src/', import.meta.url));
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : (p.endsWith('.js') ? [p] : []);
});

test('innerHTML・insertAdjacentHTML に入れる ${…} は許した定数だけ', () => {
  const found = [];
  for (const file of walk(srcDir)) {
    const text = readFileSync(file, 'utf8');
    // 代入・呼び出しの右辺のテンプレート文字列（次の ` まで）
    for (const m of text.matchAll(/(?:innerHTML\s*=|insertAdjacentHTML\([^,]+,)\s*`([^`]*)`/g)) {
      for (const v of m[1].matchAll(/\$\{([^}]*)\}/g)) {
        if (!ALLOWED.has(v[1].trim())) found.push(`${file}: ${v[1]}`);
      }
    }
    assert.doesNotMatch(text, /outerHTML\s*=|document\.write\(/, `${file} が outerHTML・document.write を使っている`);
  }
  assert.deepEqual(found, []);
});

test('外部リンク（target="_blank"）は rel="noopener noreferrer" を付ける', () => {
  for (const file of walk(srcDir)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/target:\s*'_blank'[^)]*/g)) {
      assert.match(m[0], /rel:\s*'noopener noreferrer'/, `${file}: ${m[0].slice(0, 80)}`);
    }
  }
});

test('index.html に CSP と referrer の指定がある（接続先は自分と Supabase だけ、インラインのスクリプトは許さない）', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1];
  assert.ok(csp, 'CSP がない');
  const dir = Object.fromEntries(csp.split(';').map((s) => s.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
  const { SUPABASE_URL } = { SUPABASE_URL: readFileSync(new URL('../src/config.js', import.meta.url), 'utf8').match(/SUPABASE_URL = '([^']+)'/)[1] };
  assert.deepEqual(dir['default-src'], ["'self'"]);
  assert.deepEqual(dir['script-src'], ["'self'"]);
  assert.deepEqual(dir['style-src'], ["'self'"]);
  assert.deepEqual(dir['connect-src'], ["'self'", SUPABASE_URL]);
  assert.deepEqual(dir['object-src'], ["'none'"]);
  assert.deepEqual(dir['base-uri'], ["'self'"]);
  assert.deepEqual(dir['form-action'], ["'self'"]);
  assert.ok(dir['img-src'].includes(SUPABASE_URL));
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*/);
  assert.match(html, /<meta name="referrer" content="strict-origin-when-cross-origin">/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, 'インラインのスクリプトがある');
  assert.doesNotMatch(html, /<style\b|\sstyle="/, 'インラインのスタイルがある');
});

test('観戦記録の動画のリンクは safeHttpsUrl を通す', () => {
  const rec = readFileSync(new URL('../src/ui/views/record.js', import.meta.url), 'utf8');
  const body = rec.slice(rec.indexOf('function videoRow'));
  assert.match(body.slice(0, 900), /safeHttpsUrl\(video\?\.url\)/);
  assert.doesNotMatch(body.slice(0, 900), /href: video\.url/);
});

test('外部リンクを作る extLink は safeHttpsUrl を通す', () => {
  const parts = readFileSync(new URL('../src/ui/components/parts.js', import.meta.url), 'utf8');
  const body = parts.slice(parts.indexOf('export function extLink'));
  assert.match(body.slice(0, 600), /safeHttpsUrl\(/);
});
