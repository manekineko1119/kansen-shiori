// hash でつなぐ画面の切り替え（設計書 3章）
import { parseRoute, buildHash, routeAccess } from './core/route.js';
import { setReturnTo } from './data/return-to.js';

export function startRouter({ render, getUser }) {
  function handle() {
    const route = parseRoute(location.hash);
    const access = routeAccess(route.name, getUser());
    if (access === 'login') {
      // 元の画面を覚えてログイン画面へ。戻るボタンで元の画面に戻れるよう置き換える
      setReturnTo(location.hash);
      history.replaceState(null, '', buildHash('login'));
      render(parseRoute(location.hash));
      return;
    }
    // forbidden は「権限がありません」を出す（画面側で route.forbidden を見る）
    render(access === 'forbidden' ? { ...route, forbidden: true } : route);
  }
  addEventListener('hashchange', handle);
  handle();
}
