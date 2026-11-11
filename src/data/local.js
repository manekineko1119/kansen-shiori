// 端末の localStorage を渡すための入口（ブラウザの保存領域を触るのは src/data/ だけ）。
// 使えないとき（Safari のプライベートなど）は、何も覚えない入れ物を返して起動を止めない
const memoryLocal = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

export function browserLocal() {
  try {
    const ls = window.localStorage;
    ls.getItem('kansen.probe');
    return ls;
  } catch {
    return memoryLocal();
  }
}
