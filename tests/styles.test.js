import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 色の値（16進の3・4・6・8桁、rgb(・hsl(）。URL の #/search などは対象外
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;
const FUNC = /\b(?:rgb|hsl)a?\(/g;

const stylesDir = fileURLToPath(new URL('../src/ui/styles/', import.meta.url));
const cssFiles = readdirSync(stylesDir).filter((n) => n.endsWith('.css')).sort();
const read = (name) => readFileSync(join(stylesDir, name), 'utf8');
const css = read('base.css');
const rootMatch = css.match(/:root\s*\{[^}]*\}/);

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test('base.css に最初の :root がある', () => {
  assert.ok(rootMatch);
});

test('base.css の色の値は最初の :root の中だけ', () => {
  const rest = css.replace(rootMatch[0], '');
  assert.deepEqual(rest.match(HEX) ?? [], []);
  assert.deepEqual(rest.match(FUNC) ?? [], []);
});

test('base.css 以外の CSS には色の値も :root もない（色は変数で指定する）', () => {
  assert.ok(cssFiles.length > 5);
  for (const name of cssFiles.filter((n) => n !== 'base.css')) {
    const text = read(name);
    assert.deepEqual(text.match(HEX) ?? [], [], `${name} に色の値がある`);
    assert.deepEqual(text.match(FUNC) ?? [], [], `${name} に色の関数がある`);
    assert.equal(/:root/.test(text), false, `${name} に :root がある`);
  }
});

test('index.html は styles/ の CSS をすべて読み、base.css を最初に読む', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const linked = [...html.matchAll(/<link rel="stylesheet" href="\.\/src\/ui\/styles\/([^"]+)">/g)].map((m) => m[1]);
  assert.equal(linked[0], 'base.css');
  assert.deepEqual([...linked].sort(), cssFiles);
  assert.equal(/styles\.css/.test(html), false);
});

test('base.css で [hidden] を display: none !important にする（.btn などの display に負けない）', () => {
  assert.match(css, /\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*;?\s*\}/);
});

test('日程・観戦記録の一覧の日付の欄は幅を固定する（日付の長さで H・A の印や相手の名前の位置がずれないように）', () => {
  for (const [name, selector] of [['fixtures.css', '.fixtures .item .date'], ['records.css', '.rec-list .item .date']]) {
    const rule = read(name).match(new RegExp(`${selector.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    assert.match(rule, /(?:^|;)\s*flex\s*:\s*none/, `${name} の ${selector} に flex: none がない`);
    assert.match(rule, /(?:^|;)\s*width\s*:\s*6em/, `${name} の ${selector} の幅が 6em でない`);
  }
});

test('CSS のファイルは 300 行以下', () => {
  for (const name of cssFiles) assert.ok(read(name).split(/\r?\n/).length <= 300, name);
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
