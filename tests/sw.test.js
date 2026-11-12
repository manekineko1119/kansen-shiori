import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { computeAssets, assetsHash, readSw, refsOf } from '../scripts/sw-assets.js';

// Service Worker（設計書 8章）：事前キャッシュの一覧・版の上げ忘れ・キャッシュのしかた
const sw = readSw();

test('事前キャッシュの一覧は、index.html と manifest からたどれるファイルと同じ（_shared の text.js・sync-plan.js を含む）', () => {
  assert.ok(Array.isArray(sw.assets), 'sw.js に ASSETS がない');
  assert.deepEqual(sw.assets, computeAssets(), 'npm run sw-version を実行してください');
  for (const p of ['index.html', 'manifest.webmanifest', 'src/main.js', 'vendor/supabase-js.mjs',
    'supabase/functions/_shared/text.js', 'supabase/functions/_shared/sync-plan.js',
    'src/ui/styles/base.css', 'icons/icon.svg', 'icons/icon-maskable-512.png']) {
    assert.ok(sw.assets.includes(p), `${p} がない`);
  }
});

test('画面のファイルを変えたら版を上げてある（指紋が一致する）', () => {
  assert.match(sw.version ?? '', /^\d{4}-\d{2}-\d{2}\.\d+$/);
  assert.equal(sw.hash, assetsHash(sw.assets), '画面のファイルが変わっています。npm run sw-version を実行してください');
});

// sw.js を偽の self・caches・fetch の中で動かす
const ORIGIN = 'https://example.github.io';
const SCOPE = `${ORIGIN}/kansen-shiori/`;
function load({ cached = {}, otherCaches = {} } = {}) {
  const handlers = {};
  const stores = new Map();
  const open = (name) => { if (!stores.has(name)) stores.set(name, new Map()); return stores.get(name); };
  const cacheName = `kansen-shiori-${sw.version}`;
  for (const [path, body] of Object.entries(cached)) open(cacheName).set(SCOPE + path, { body });
  for (const name of Object.keys(otherCaches)) open(name);
  const fetched = [];
  let skipped = false;
  const caches = {
    async open(name) {
      const m = open(name);
      return {
        async put(key, res) { m.set(typeof key === 'string' ? key : key.url, res); },
        async match(key, opts = {}) {
          const url = typeof key === 'string' ? key : key.url;
          const k = opts.ignoreSearch ? url.split('?')[0] : url;
          return m.get(k);
        },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const self = {
    location: new URL(`${SCOPE}sw.js`),
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: () => { skipped = true; },
    clients: { claim: async () => {} },
  };
  const fetch = async (req) => { fetched.push(req); return { ok: true, status: 200, body: `net:${req.url ?? req}` }; };
  class Request { constructor(url, init = {}) { this.url = String(url); this.cache = init.cache; this.method = 'GET'; } }
  vm.runInNewContext(sw.text, { self, caches, fetch, Request, URL, URLSearchParams, Promise, console });
  return { handlers, stores, fetched, cacheName, skipped: () => skipped };
}

async function dispatchFetch(env, request) {
  let responded = null;
  env.handlers.fetch({ request, respondWith: (p) => { responded = p; } });
  return responded ? await responded : null;
}

test('install：すべてのファイルを cache: reload で取り直して、版の名前のキャッシュに入れる', async () => {
  const env = load();
  let wait;
  env.handlers.install({ waitUntil: (p) => { wait = p; } });
  await wait;
  assert.equal(env.fetched.length, sw.assets.length);
  assert.ok(env.fetched.every((r) => r.cache === 'reload'));
  assert.equal(env.stores.get(env.cacheName).size, sw.assets.length);
  assert.ok(env.stores.get(env.cacheName).has(`${SCOPE}index.html`));
  assert.equal(env.skipped(), false);
});

test('activate：kansen-shiori- の古い版だけ消し、ほかのアプリのキャッシュは残す', async () => {
  const env = load({ otherCaches: { 'kansen-shiori-2000-01-01.1': 1, 'other-app-v1': 1 } });
  env.stores.set(env.cacheName, new Map());
  let wait;
  env.handlers.activate({ waitUntil: (p) => { wait = p; } });
  await wait;
  assert.deepEqual([...env.stores.keys()].sort(), [env.cacheName, 'other-app-v1'].sort());
});

test('fetch：Supabase（別のオリジン）と POST には手を出さない', async () => {
  const env = load({ cached: { 'src/main.js': 'js' } });
  assert.equal(await dispatchFetch(env, { url: 'https://abc.supabase.co/rest/v1/clubs?select=id', method: 'GET', mode: 'cors' }), null);
  assert.equal(await dispatchFetch(env, { url: `${SCOPE}src/main.js`, method: 'POST', mode: 'cors' }), null);
});

test('fetch：事前キャッシュのファイルはキャッシュから返し、なければネットワーク', async () => {
  const env = load({ cached: { 'src/ui/styles/base.css': 'css' } });
  assert.deepEqual(await dispatchFetch(env, { url: `${SCOPE}src/ui/styles/base.css`, method: 'GET', mode: 'no-cors' }), { body: 'css' });
  assert.equal(env.fetched.length, 0);
  const res = await dispatchFetch(env, { url: `${SCOPE}src/main.js`, method: 'GET', mode: 'cors' });
  assert.equal(res.status, 200);
  assert.equal(env.fetched.length, 1);
});

test('fetch：事前キャッシュにない同じオリジンのファイル・スコープの外には手を出さない', async () => {
  const env = load();
  assert.equal(await dispatchFetch(env, { url: `${SCOPE}src/unknown.js`, method: 'GET', mode: 'cors' }), null);
  assert.equal(await dispatchFetch(env, { url: `${ORIGIN}/other-app/index.html`, method: 'GET', mode: 'cors' }), null);
  assert.equal(await dispatchFetch(env, { url: `${ORIGIN}/other-app/`, method: 'GET', mode: 'navigate' }), null);
});

test('ナビゲーションの index.html がキャッシュになければネットワークから', async () => {
  const env = load();
  const res = await dispatchFetch(env, { url: `${SCOPE}?code=abc`, method: 'GET', mode: 'navigate' });
  assert.equal(res.status, 200);
  assert.equal(env.fetched.length, 1);
});

test('refsOf：相対パスの JS の文字列（静的・動的な import、export from）と CSS の url() をすべて拾う', () => {
  const js = [
    "import a from './a.js'; // import x from './commented.js'",
    'export { b } from "../b.js";',
    "const c = await import('./c.js');",
    "import './side.js';",
    "brand.innerHTML = '<img src=\"./icons/icon.svg\">';",
    "const u = 'https://example.com/x.js';",
  ].join('\n');
  assert.deepEqual(refsOf('src/ui/x.js', js).sort(), [
    'icons/icon.svg', 'src/b.js', 'src/ui/a.js', 'src/ui/c.js', 'src/ui/commented.js', 'src/ui/side.js',
  ]);
  const css = ".a { background: url('../img/bg.png'); } .b { background: url(data:image/png;base64,AA); } .c { src: url(\"./f.woff2\"); }";
  assert.deepEqual(refsOf('src/ui/styles/x.css', css).sort(), ['src/ui/img/bg.png', 'src/ui/styles/f.woff2']);
});

test('fetch：ナビゲーションは ?code= 付き（ログインから戻ったとき）でも index.html を返す', async () => {
  const env = load({ cached: { 'index.html': 'html' } });
  assert.deepEqual(await dispatchFetch(env, { url: `${SCOPE}?code=abc#/search`, method: 'GET', mode: 'navigate' }), { body: 'html' });
  assert.deepEqual(await dispatchFetch(env, { url: `${SCOPE}index.html`, method: 'GET', mode: 'navigate' }), { body: 'html' });
  assert.equal(env.fetched.length, 0);
});

test('message：skipWaiting を受けたときだけ待機をやめる', () => {
  const env = load();
  env.handlers.message({ data: 'other' });
  assert.equal(env.skipped(), false);
  env.handlers.message({ data: 'skipWaiting' });
  assert.equal(env.skipped(), true);
});
