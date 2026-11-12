// 画面の枠：見出し・上のリンク・お知らせ・メニュー・本文（設計書 3章）
import { renderNav, navKeyOf, ICONS } from './components/nav.js';
import { TITLES } from './views/placeholder.js';
import { el } from './components/parts.js';

// ログアウトは設定画面の下に置く（見出しの右には出さない）
function topLinks({ user, onLogin }) {
  const box = el('div', { class: 'toplinks' });
  if (user?.isAdmin) box.append(el('a', { class: 'toplink', href: '#/admin' }, '管理'));
  if (!user) box.append(el('a', { class: 'toplink', href: '#/login', onclick: onLogin }, 'ログイン'));
  return box;
}

// notices：画面の上に出すお知らせの文（空は出さない）。banners：その上に出す帯（DOM。更新の表示・iPhone の案内。8章）
// onLogin：ログインのリンクを押したとき（戻り先を覚える）
export function renderFrame({ route, user, notices = [], banners = [], body, onLogin }) {
  const header = el('header', { class: 'top' }, el('h1', null, TITLES[route.name] ?? '観戦のしおり'), topLinks({ user, onLogin }));
  header.insertAdjacentHTML('beforeend', `<a class="gearbtn" href="#/settings" aria-label="設定">${ICONS.settings}</a>`);
  const main = el('main', null, banners,
    notices.filter(Boolean).map((t) => el('p', { class: 'note', role: 'status' }, t)), body);
  return el('div', { class: 'app' }, renderNav(navKeyOf(route.name)), el('div', { class: 'col' }, header, main));
}
