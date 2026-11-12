// Service Worker の登録と更新の表示、iPhone のホーム画面への追加の案内（設計書 8章・8.1、FR-35）
// 判断は src/core/pwa.js、「閉じた」の保存は src/data/install-guide.js
import { el } from './components/parts.js';
import { isIos, shouldShowInstallGuide, swMode } from '../core/pwa.js';
import { createInstallGuide } from '../data/install-guide.js';

// onChange：帯の出し分けが変わったとき（画面を描き直す）
export function createPwa({ local, onChange }) {
  const guide = createInstallGuide(local);
  const ios = isIos({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints });
  const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  let waiting = null; // 待っている新しい版の Service Worker
  let reloading = false;

  function watch(reg) {
    const found = (w) => { if (w && navigator.serviceWorker.controller) { waiting = w; onChange(); } };
    found(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed') found(w); });
    });
    // 画面に戻ったときに新しい版を確かめる（起動時はブラウザが確かめる）
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }

  async function start() {
    if (!('serviceWorker' in navigator)) return;
    try {
      if (swMode({ hostname: location.hostname, search: location.search }) === 'unregister') {
        for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
        return;
      }
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) location.reload(); // 「再読み込み」を押したときだけ
      });
      watch(await navigator.serviceWorker.register('./sw.js'));
    } catch (e) {
      console.warn('Service Worker を登録できませんでした', e); // なくても画面は動く
    }
  }

  function updateBanner() {
    return el('div', { class: 'pwa-banner', role: 'status' },
      el('span', null, '更新があります'),
      el('button', {
        type: 'button', class: 'btn btn-small',
        onclick: () => {
          reloading = true;
          // 別のタブで先に切り替わっていたら、もう待っていないので、そのまま読み直す
          if (waiting?.state === 'installed') waiting.postMessage('skipWaiting');
          else location.reload();
        },
      }, '再読み込み'));
  }

  function installGuide() {
    return el('div', { class: 'pwa-banner', role: 'note' },
      el('span', null, 'ホーム画面に追加すると、アプリのように使えます：Safari の共有ボタン →「ホーム画面に追加」'),
      el('button', { type: 'button', class: 'btn btn-sub btn-small', onclick: () => { guide.dismiss(); onChange(); } }, '閉じる'));
  }

  // 画面の上に出す帯（DOM の配列）
  function banners(routeName) {
    const list = [];
    if (waiting) list.push(updateBanner());
    if (shouldShowInstallGuide({ ios, standalone: standalone(), dismissed: guide.dismissed(), routeName })) list.push(installGuide());
    return list;
  }

  return { start, banners };
}
