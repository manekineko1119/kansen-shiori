// 画面の枠：見出し・上のリンク・お知らせ・メニュー・本文（設計書 3章）
import { renderNav, navKeyOf, ICONS } from './components/nav.js';
import { TITLES } from './views/placeholder.js';
import { el } from './components/parts.js';

function topLinks({ user, onSignOut, onLogin }) {
  const box = el('div', { class: 'toplinks' });
  if (user?.isAdmin) box.append(el('a', { class: 'toplink', href: '#/admin' }, '管理'));
  box.append(user
    ? el('button', { class: 'toplink', type: 'button', onclick: onSignOut }, 'ログアウト')
    : el('a', { class: 'toplink', href: '#/login', onclick: onLogin }, 'ログイン'));
  return box;
}

// notices：画面の上に出すお知らせの文（空は出さない）。onLogin：ログインのリンクを押したとき（戻り先を覚える）
export function renderFrame({ route, user, notices = [], body, onSignOut, onLogin }) {
  const header = el('header', { class: 'top' }, el('h1', null, TITLES[route.name] ?? '観戦のしおり'), topLinks({ user, onSignOut, onLogin }));
  header.insertAdjacentHTML('beforeend', `<a class="gearbtn" href="#/settings" aria-label="設定">${ICONS.settings}</a>`);
  const main = el('main', null,
    notices.filter(Boolean).map((t) => el('p', { class: 'note', role: 'status' }, t)), body);
  return el('div', { class: 'app' }, renderNav(navKeyOf(route.name)), el('div', { class: 'col' }, header, main));
}
