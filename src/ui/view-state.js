// 画面ごとの入力中の値とスクロール位置をメモリに持つ（設計書 3.5、NFR-15）。DOM は使わない

// 同じ画面・同じ項目なら同じ文字列になる
export function routeKey(route) {
  const params = route.params ?? {};
  const sorted = Object.keys(params).sort().map((k) => [k, params[k]]);
  return JSON.stringify([route.name, sorted, route.query ?? '']);
}

// 利用者が同じか（ID だけで比べる。未ログインは null）。入力中の値を残すか消すかの判断に使う
export const sameUserId = (a, b) => (a?.id ?? null) === (b?.id ?? null);

export function createViewState() {
  const forms = new Map();
  const scrolls = new Map();
  const photoRetries = new Map(); // 写真だけ失敗した保存：{ file, message }（File はメモリだけ。描き直しても残す）
  const errors = new Map(); // 保存の失敗の理由（data-err の文）：{ 項目名: 文 }。描き直し・開閉・回転をまたいで出し直す（M-6）
  return {
    getForm: (key) => ({ ...(forms.get(key) ?? {}) }),
    setForm: (key, values) => { forms.set(key, { ...values }); },
    clearForm: (key) => { forms.delete(key); },
    // 利用者が変わったとき、前の人の入力とスクロール位置を全部捨てる
    clearAll: () => { forms.clear(); scrolls.clear(); photoRetries.clear(); errors.clear(); },
    getErrors: (key) => ({ ...(errors.get(key) ?? {}) }),
    setErrors: (key, v) => { if (Object.keys(v ?? {}).length) errors.set(key, { ...v }); else errors.delete(key); },
    clearErrors: (key) => { errors.delete(key); },
    // 別の画面に移ったとき：今の画面（routeKey）以外の理由を捨てる。同じ画面の描き直しでは残る
    dropErrorsExcept: (rk) => { for (const k of [...errors.keys()]) if (!k.startsWith(`${rk}|`)) errors.delete(k); },
    getPhotoRetry: (key) => photoRetries.get(key) ?? null,
    setPhotoRetry: (key, v) => { photoRetries.set(key, v); },
    clearPhotoRetry: (key) => { photoRetries.delete(key); },
    getScroll: (key) => scrolls.get(key) ?? 0,
    hasScroll: (key) => scrolls.has(key),
    setScroll: (key, y) => { scrolls.set(key, y); },
  };
}

// 遷移のときのスクロール：'keep'（動かさない）| 'restore'（残した位置へ）| 'top'（先頭へ）。設計書 3.5
// M・L は同じ画面で query だけ違う（一覧で別の項目を選んだ）なら動かさない。S は残っていれば戻す
export function scrollPlan({ prev, next, size, hasSaved }) {
  const sameScreen = prev && prev.name === next.name && JSON.stringify(prev.params ?? {}) === JSON.stringify(next.params ?? {});
  if (size !== 'S' && sameScreen) return 'keep';
  return hasSaved ? 'restore' : 'top';
}
