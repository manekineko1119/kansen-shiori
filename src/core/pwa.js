// PWA の判断（設計書 8章・8.1）。ブラウザの値は引数で受け取る

// iPhone・iPad か。iPadOS の Safari は Mac の名前を名乗るので、タッチの点数で見分ける
export function isIos({ userAgent, maxTouchPoints }) {
  const ua = String(userAgent ?? '');
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && Number(maxTouchPoints) > 1;
}

// ホーム画面への追加の案内（FR-35）：iOS で、ホーム画面から開いておらず、閉じていないときに、検索画面だけで出す
export function shouldShowInstallGuide({ ios, standalone, dismissed, routeName }) {
  return Boolean(ios && !standalone && !dismissed && routeName === 'search');
}

// Service Worker を登録するか。localhost では ?sw=1 のときだけ（ローカルで直したファイルが古いキャッシュに隠れないように）
export function swMode({ hostname, search }) {
  const local = hostname === 'localhost' || hostname === '127.0.0.1';
  if (!local) return 'register';
  return new URLSearchParams(search ?? '').get('sw') === '1' ? 'register' : 'unregister';
}
