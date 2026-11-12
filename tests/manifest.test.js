import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

// manifest と iPhone 用の指定（設計書 8章・8.1・8.2）
const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.webmanifest', root), 'utf8'));
const html = readFileSync(new URL('index.html', root), 'utf8');

// PNG の IHDR から幅・高さを読む
function pngSize(path) {
  const b = readFileSync(new URL(path, root));
  assert.equal(b.toString('ascii', 1, 4), 'PNG', `${path} が PNG でない`);
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
}

test('名前・開始の画面・表示のしかた', () => {
  assert.equal(manifest.name, '観戦のしおり');
  assert.equal(manifest.short_name, '観戦のしおり');
  assert.equal(manifest.lang, 'ja');
  assert.equal(manifest.id, './');
  assert.equal(manifest.start_url, './#/search');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
});

test('テーマカラーは index.html の theme-color と同じ', () => {
  const m = html.match(/<meta name="theme-color" content="([^"]+)">/);
  assert.ok(m);
  assert.equal(manifest.theme_color, m[1]);
  assert.equal(manifest.background_color, m[1]);
});

test('アイコン：192・512 の any と maskable。ファイルの大きさが sizes と同じ', () => {
  const want = [['any', '192x192'], ['any', '512x512'], ['maskable', '192x192'], ['maskable', '512x512']];
  for (const [purpose, sizes] of want) {
    const icon = manifest.icons.find((i) => i.purpose === purpose && i.sizes === sizes);
    assert.ok(icon, `${purpose} ${sizes} がない`);
    assert.equal(icon.type, 'image/png');
    assert.ok(existsSync(new URL(icon.src, root)), `${icon.src} がない`);
    assert.equal(pngSize(icon.src), sizes);
  }
  assert.equal(pngSize('icons/apple-touch-icon-180.png'), '180x180');
});

test('index.html に manifest と iPhone 用の指定がある', () => {
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest">/);
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes">/);
  assert.match(html, /<meta name="mobile-web-app-capable" content="yes">/);
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="観戦のしおり">/);
  assert.match(html, /<meta name="apple-mobile-web-app-status-bar-style" content="default">/);
  assert.match(html, /<link rel="apple-touch-icon" href="\.\/icons\/apple-touch-icon-180\.png">/);
});
