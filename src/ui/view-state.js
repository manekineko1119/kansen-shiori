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
  return {
    getForm: (key) => ({ ...(forms.get(key) ?? {}) }),
    setForm: (key, values) => { forms.set(key, { ...values }); },
    clearForm: (key) => { forms.delete(key); },
    // 利用者が変わったとき、前の人の入力とスクロール位置を全部捨てる
    clearAll: () => { forms.clear(); scrolls.clear(); },
    getScroll: (key) => scrolls.get(key) ?? 0,
    setScroll: (key, y) => { scrolls.set(key, y); },
  };
}
