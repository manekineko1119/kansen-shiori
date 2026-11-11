// 起動。画面の枠（メニュー・見出し・本文）を作り、幅の区分を data-size に入れる
import { sizeClass, MEDIA } from './core/layout.js';
import { startRouter } from './router.js';
import { renderNav, navKeyOf, ICONS } from './ui/components/nav.js';
import { renderPlaceholder, TITLES } from './ui/views/placeholder.js';
import { createViewState, routeKey } from './ui/view-state.js';
import { rerender } from './ui/mount.js';
import { openKv } from './data/kv-idb.js';
import { createSnapshot, offlineLabel } from './data/snapshot.js';
import { readMastersSnapshot, refreshMasters } from './data/masters.js';
import { getClient } from './data/client.js';

// ログインは 5-6 で作る。それまでは常に未ログイン
const getUser = () => null;

const root = document.getElementById('app');
const state = createViewState(); // 入力中の値とスクロール位置（メモリ）
let currentRoute = null;
let masters = null; // 共通データの状態（readMastersSnapshot／refreshMasters の結果）

function updateSize() {
  document.documentElement.dataset.size = sizeClass(window.innerWidth);
}

// 画面の枠と本文を作って差し替える（スクロールは触らない）
function draw(route) {
  currentRoute = route;
  const app = document.createElement('div');
  app.className = 'app';
  const col = document.createElement('div');
  col.className = 'col';
  const header = document.createElement('header');
  header.className = 'top';
  header.innerHTML = `<h1></h1><a class="gearbtn" href="#/settings" aria-label="設定">${ICONS.settings}</a>`;
  header.querySelector('h1').textContent = TITLES[route.name] ?? '観戦のしおり';
  const main = document.createElement('main');
  main.append(renderPlaceholder(route, state, routeKey(route), masters)); // 5-3 で本物の画面に差し替える
  col.append(header, main);
  app.append(renderNav(navKeyOf(route.name)), col);
  root.replaceChildren(app);
}

// 画面の遷移：先頭から始める
function renderApp(route) {
  draw(route);
  window.scrollTo(0, 0);
}

updateSize();
for (const query of Object.values(MEDIA)) {
  matchMedia(query).addEventListener('change', () => {
    updateSize();
    if (currentRoute) rerender(state, routeKey(currentRoute), () => draw(currentRoute)); // 入力とスクロールを残す
  });
}
startRouter({ render: renderApp, getUser });

// 共通データ：スナップショットで先に出し、裏で最新を取って差し替える（NFR-04）。段6 で本物の画面につなぐ
async function loadMasters() {
  const snapshot = createSnapshot(await openKv());
  const old = await readMastersSnapshot(snapshot);
  if (old) {
    masters = { status: 'offline', data: old.data, label: offlineLabel(old.savedAt) };
    if (currentRoute) rerender(state, routeKey(currentRoute), () => draw(currentRoute));
  }
  masters = await refreshMasters({ client: getClient(), snapshot, nowMs: Date.now() });
  if (currentRoute) rerender(state, routeKey(currentRoute), () => draw(currentRoute));
}
loadMasters().catch(() => {
  masters = { status: 'unavailable', message: '初回は通信できる場所で開いてください' };
  if (currentRoute) draw(currentRoute);
});
