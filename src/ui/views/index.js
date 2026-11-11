// 画面の振り分け。route.name → (ctx) => HTMLElement（設計書 3章、D29）
// 段6 の本物の画面ができるまで、未作成の画面は仮の画面（placeholder）で出す
import { renderPlaceholder } from './placeholder.js';
import { renderLogin } from './login.js';
import { renderWelcome } from './welcome.js';
import { renderSettings } from './settings.js';
import { el, section } from '../components/parts.js';

const placeholder = (ctx) => renderPlaceholder(ctx.route, ctx.state, ctx.key, ctx.masters.status === 'loading' ? null : ctx.masters);

// ctx.auth：{ loginError, signIn, signOut }。ctx.welcome：{ settings, save }（settings が null なら仮の画面）
export const VIEWS = {
  search: placeholder,
  result: placeholder,
  fixtures: placeholder,
  calendar: placeholder,
  trips: placeholder,
  trip: placeholder,
  records: placeholder,
  record: placeholder,
  settings: renderSettings,
  admin: placeholder,
  login: (ctx) => renderLogin({ error: ctx.auth.loginError, user: ctx.user, onSignIn: ctx.auth.signIn, onSignOut: ctx.auth.signOut }),
  welcome: (ctx) => {
    if (!ctx.welcome.settings) return placeholder(ctx);
    return renderWelcome({ settings: ctx.welcome.settings, clubs: ctx.masters.data?.clubs ?? [], state: ctx.state, key: ctx.key, onSave: ctx.welcome.save });
  },
};

// 画面の関数が投げても、枠（メニュー）は使えるままにする
export function renderView(ctx) {
  if (ctx.route.forbidden) return section('権限がありません', el('p', { class: 'muted' }, 'この画面を開く権限がありません。'));
  try {
    return (VIEWS[ctx.route.name] ?? placeholder)(ctx);
  } catch (e) {
    console.error(e);
    return section('この画面を表示できませんでした',
      el('p', { class: 'muted' }, '再読み込みしても直らないときは、時間をおいて開いてください。'),
      el('button', { class: 'btn', type: 'button', onclick: () => location.reload() }, '再読み込み'));
  }
}
