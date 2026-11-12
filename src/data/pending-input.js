// ログインの期限切れで Google のログインへ移るあいだだけ、入力中の値を1件預かる（設計書 4.5・9章、段6 のまとめのレビュー I-2）
// Google から戻るとページを読み直すので、メモリの入力（view-state）は消える。そのため sessionStorage（このタブだけ）に置く。
// 個人の文が端末に残るので、置くのは期限切れのときの1件だけ。読んだら必ず消し、別の利用者・古すぎるものは戻さない
const KEY = 'kansen.pendingInput';
export const PENDING_INPUT_MAX_AGE_MS = 60 * 60 * 1000; // 1時間より古いものは戻さない

const defaultStorage = () => sessionStorage;

export function createPendingInput({ storage = defaultStorage } = {}) {
  const store = () => {
    try { return storage(); } catch { return null; }
  };
  return {
    // values：入力欄の name → 値。空なら置かない
    save({ userId, key, values, nowMs }) {
      if (!userId || !values || Object.keys(values).length === 0) return;
      try {
        store()?.setItem(KEY, JSON.stringify({ userId, key, values, savedAt: nowMs }));
      } catch { /* 置けなくても、ログインへは進む */ }
    },
    // 同じ利用者で新しいものなら { key, values }。どの場合も消す
    take({ userId, nowMs }) {
      const s = store();
      if (!s) return null;
      let raw = null;
      try {
        raw = s.getItem(KEY);
        s.removeItem(KEY);
      } catch {
        return null;
      }
      if (raw === null) return null;
      try {
        const v = JSON.parse(raw);
        if (v?.userId !== userId || typeof v.key !== 'string' || typeof v.values !== 'object' || v.values === null) return null;
        if (!(nowMs - v.savedAt <= PENDING_INPUT_MAX_AGE_MS)) return null;
        return { key: v.key, values: v.values };
      } catch {
        return null;
      }
    },
  };
}
