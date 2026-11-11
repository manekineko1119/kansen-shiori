// テスト用の保存先の偽物（5-5・5-7 で使う）
export function fakeKv() {
  const map = new Map();
  return {
    async get(key) { return map.has(key) ? map.get(key) : undefined; },
    async set(key, value) { map.set(key, value); },
    async delete(key) { map.delete(key); },
    async keys() { return [...map.keys()]; },
    _map: map,
  };
}

export function fakeLocal(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    _map: map,
  };
}
