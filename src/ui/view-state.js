// 画面ごとの入力中の値とスクロール位置をメモリに持つ（設計書 3.5、NFR-15）。DOM は使わない

// 同じ画面・同じ項目なら同じ文字列になる
export function routeKey(route) {
  const params = route.params ?? {};
  const sorted = Object.keys(params).sort().map((k) => [k, params[k]]);
  return JSON.stringify([route.name, sorted, route.query ?? '']);
}

export function createViewState() {
  const forms = new Map();
  const scrolls = new Map();
  return {
    getForm: (key) => ({ ...(forms.get(key) ?? {}) }),
    setForm: (key, values) => { forms.set(key, { ...values }); },
    getScroll: (key) => scrolls.get(key) ?? 0,
    setScroll: (key, y) => { scrolls.set(key, y); },
  };
}
