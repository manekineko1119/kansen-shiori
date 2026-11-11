// ログインの前に開こうとしていた画面を覚える（ログイン後に戻すため。設計書 9章）
// ブラウザの保存領域を触るのは src/data/ だけ
const KEY = 'kansen.returnTo';

export function setReturnTo(hash) {
  try {
    sessionStorage.setItem(KEY, hash);
  } catch {
    // 保存できなくても動く
  }
}

export function takeReturnTo() {
  try {
    const v = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return v;
  } catch {
    return null;
  }
}
