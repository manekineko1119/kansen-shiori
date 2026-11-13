// 観戦のしおりの Service Worker（設計書 8章）。画面のファイルは版ごとに丸ごと入れ替える
// VERSION・ASSETS_SHA256・ASSETS は npm run sw-version が書き換える（手で直さない）
const VERSION = '2026-11-13.22';
const ASSETS_SHA256 = '45535f76e2549b7d9ae108d034f8152a93bf0186398c153f616afd3d17c97918';
const ASSETS = [
  "icons/apple-touch-icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-192.png",
  "icons/icon-maskable-512.png",
  "icons/icon.svg",
  "index.html",
  "manifest.webmanifest",
  "src/auth/apply.js",
  "src/auth/auth.js",
  "src/config.js",
  "src/core/admin-form.js",
  "src/core/auth-url.js",
  "src/core/calendar-view.js",
  "src/core/calendar.js",
  "src/core/fixture-form.js",
  "src/core/fixture-id.js",
  "src/core/fixture-list.js",
  "src/core/fixture-order.js",
  "src/core/fixture-view.js",
  "src/core/fixtures.js",
  "src/core/flight.js",
  "src/core/format.js",
  "src/core/import-csv.js",
  "src/core/layout.js",
  "src/core/links/agoda.js",
  "src/core/links/bus.js",
  "src/core/links/google-maps.js",
  "src/core/links/jleague.js",
  "src/core/links/skyscanner.js",
  "src/core/links/toyoko-inn.js",
  "src/core/links/yahoo-transit.js",
  "src/core/lodging.js",
  "src/core/match-import.js",
  "src/core/photo.js",
  "src/core/pwa.js",
  "src/core/record-form.js",
  "src/core/record-list.js",
  "src/core/result-flight.js",
  "src/core/result-page.js",
  "src/core/result.js",
  "src/core/route.js",
  "src/core/safe-url.js",
  "src/core/search-form.js",
  "src/core/search-query.js",
  "src/core/season-clubs.js",
  "src/core/settings-form.js",
  "src/core/stats.js",
  "src/core/sync-status.js",
  "src/core/time.js",
  "src/core/trip-view.js",
  "src/core/trips.js",
  "src/core/validate.js",
  "src/data/admin-cache.js",
  "src/data/admin.js",
  "src/data/client.js",
  "src/data/errors.js",
  "src/data/fixture-cache.js",
  "src/data/history.js",
  "src/data/install-guide.js",
  "src/data/kv-idb.js",
  "src/data/last-user.js",
  "src/data/local.js",
  "src/data/masters-loader.js",
  "src/data/masters.js",
  "src/data/pending-input.js",
  "src/data/personal-holder.js",
  "src/data/personal.js",
  "src/data/photos.js",
  "src/data/records.js",
  "src/data/return-to.js",
  "src/data/season-cache.js",
  "src/data/settings-holder.js",
  "src/data/settings.js",
  "src/data/snapshot.js",
  "src/data/trips.js",
  "src/main.js",
  "src/router.js",
  "src/ui/components/form-util.js",
  "src/ui/components/nav.js",
  "src/ui/components/parts.js",
  "src/ui/components/record-list.js",
  "src/ui/components/scoreboard.js",
  "src/ui/components/ticket.js",
  "src/ui/components/timeline.js",
  "src/ui/ctx.js",
  "src/ui/frame.js",
  "src/ui/mount.js",
  "src/ui/notice.js",
  "src/ui/photo-resize.js",
  "src/ui/pwa.js",
  "src/ui/size.js",
  "src/ui/styles/admin.css",
  "src/ui/styles/base.css",
  "src/ui/styles/calendar.css",
  "src/ui/styles/fixtures.css",
  "src/ui/styles/layout.css",
  "src/ui/styles/parts.css",
  "src/ui/styles/pwa.css",
  "src/ui/styles/record.css",
  "src/ui/styles/records.css",
  "src/ui/styles/result.css",
  "src/ui/styles/search.css",
  "src/ui/styles/trips.css",
  "src/ui/view-state.js",
  "src/ui/views/admin/clubs.js",
  "src/ui/views/admin/common.js",
  "src/ui/views/admin/fixture-url.js",
  "src/ui/views/admin/fixtures.js",
  "src/ui/views/admin/index.js",
  "src/ui/views/admin/photos.js",
  "src/ui/views/admin/seasons.js",
  "src/ui/views/admin/stadium-form.js",
  "src/ui/views/admin/stadiums.js",
  "src/ui/views/admin/sync.js",
  "src/ui/views/admin/testers.js",
  "src/ui/views/admin/unresulted.js",
  "src/ui/views/calendar.js",
  "src/ui/views/fixtures.js",
  "src/ui/views/index.js",
  "src/ui/views/login.js",
  "src/ui/views/placeholder.js",
  "src/ui/views/record-edit.js",
  "src/ui/views/record-fixture-edit.js",
  "src/ui/views/record-photo.js",
  "src/ui/views/record.js",
  "src/ui/views/records.js",
  "src/ui/views/result-flight.js",
  "src/ui/views/result.js",
  "src/ui/views/search.js",
  "src/ui/views/settings.js",
  "src/ui/views/trip-form.js",
  "src/ui/views/trips.js",
  "src/ui/views/welcome.js",
  "supabase/functions/_shared/jleague-parse.js",
  "supabase/functions/_shared/sync-plan.js",
  "supabase/functions/_shared/text.js",
  "vendor/supabase-js.mjs"
];

const PREFIX = 'kansen-shiori-';
const CACHE = PREFIX + VERSION;
const abs = (path) => new URL(path, self.location).href;
const OWN = new Set(ASSETS.map(abs)); // この版のファイル（これ以外の通信には手を出さない）

// 事前キャッシュ：HTTP のキャッシュ（GitHub Pages は max-age=600）を通さずに取り直す。1つでも失敗したら、この版は入れない
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      await Promise.all(ASSETS.map(async (path) => {
        const res = await fetch(new Request(abs(path), { cache: 'reload' }));
        if (!res.ok) throw new Error(`${path}: ${res.status}`);
        await cache.put(abs(path), res);
      }));
    } catch (e) {
      await caches.delete(CACHE);
      throw e;
    }
  })());
});

// 古い版のキャッシュを消す（同じ github.io のほかのアプリのキャッシュには触れない）
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith(PREFIX) && n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

async function fromCache(key, request, opts) {
  const cache = await caches.open(CACHE);
  return (await cache.match(key, opts)) ?? fetch(request);
}

// この版のファイルの GET と、アプリの中へのナビゲーションだけをキャッシュから返す。
// Supabase などほかのオリジン・一覧にないファイルには手を出さない（キャッシュしない）
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(abs('./'))) return;
  if (req.mode === 'navigate') {
    // 画面は index.html の1つだけ（# で切り替える）。ログインから戻る ?code= 付きも同じ。なければネットワーク
    event.respondWith(fromCache(abs('index.html'), req, { ignoreSearch: true }));
    return;
  }
  if (!OWN.has(url.href)) return;
  event.respondWith(fromCache(req, req));
});

// 画面の「再読み込み」を押したときだけ、待っている新しい版に切り替える
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
