import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 色の値（16進の3・4・6・8桁、rgb(・hsl(）。URL の #/search などは対象外
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;
const FUNC = /\b(?:rgb|hsl)a?\(/g;

const css = readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8');
const rootMatch = css.match(/:root\s*\{[^}]*\}/);

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test('styles.css に最初の :root がある', () => {
  assert.ok(rootMatch);
});

test('styles.css の色の値は最初の :root の中だけ', () => {
  const rest = css.replace(rootMatch[0], '');
  assert.deepEqual(rest.match(HEX) ?? [], []);
  assert.deepEqual(rest.match(FUNC) ?? [], []);
});

test('src/ 以下の JS と index.html に色の値がない（theme-color の meta だけは除く）', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const files = [...walk(join(root, 'src')).filter((p) => p.endsWith('.js')), join(root, 'index.html')];
  assert.ok(files.length > 5);
  for (const f of files) {
    const text = readFileSync(f, 'utf8').replace(/<meta name="theme-color"[^>]*>/g, '');
    assert.deepEqual(text.match(HEX) ?? [], [], `${f} に色の値がある`);
    assert.deepEqual(text.match(FUNC) ?? [], [], `${f} に色の関数がある`);
  }
});

test(':root に切り替える色と結果の色がある', () => {
  const r = rootMatch[0];
  for (const [name, value] of [
    ['--theme-primary', '#0E5A3A'], ['--theme-on-primary', '#FFFFFF'], ['--theme-accent', '#F2B01E'],
    ['--theme-tint', '#D9E8DF'], ['--win', '#1565C0'], ['--lose', '#C62828'], ['--draw', '#616161'],
  ]) {
    assert.match(r, new RegExp(`${name}\\s*:\\s*${value}\\b`, 'i'), name);
  }
});
