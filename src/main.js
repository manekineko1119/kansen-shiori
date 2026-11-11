// 起動。画面の枠（メニュー・見出し・本文）を作り、幅の区分を data-size に入れる
import { sizeClass, MEDIA } from './core/layout.js';
import { startRouter } from './router.js';
import { renderNav, navKeyOf, ICONS } from './ui/components/nav.js';
import { renderPlaceholder, TITLES } from './ui/views/placeholder.js';

// ログインは 5-6 で作る。それまでは常に未ログイン
const getUser = () => null;

const root = document.getElementById('app');
let currentRoute = null;

function updateSize() {
  document.documentElement.dataset.size = sizeClass(window.innerWidth);
}

// keepScroll：幅の区分が変わって作り直すときだけ true。画面の遷移では先頭から始める
function renderApp(route, keepScroll = false) {
  currentRoute = route;
  const scrollY = keepScroll ? window.scrollY : 0;
  const app = document.createElement('div');
  app.className = 'app';
  const col = document.createElement('div');
  col.className = 'col';
  const header = document.createElement('header');
  header.className = 'top';
  header.innerHTML = `<h1></h1><a class="gearbtn" href="#/settings" aria-label="設定">${ICONS.settings}</a>`;
  header.querySelector('h1').textContent = TITLES[route.name] ?? '観戦のしおり';
  const main = document.createElement('main');
  main.append(renderPlaceholder(route)); // 5-3 で本物の画面に差し替える
  col.append(header, main);
  app.append(renderNav(navKeyOf(route.name)), col);
  root.replaceChildren(app);
  window.scrollTo(0, scrollY);
}

updateSize();
for (const query of Object.values(MEDIA)) {
  matchMedia(query).addEventListener('change', () => {
    updateSize();
    if (currentRoute) renderApp(currentRoute, true); // 画面の作り直しの中身は 5-3
  });
}
startRouter({ render: renderApp, getUser });
