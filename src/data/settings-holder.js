// 画面に渡す設定の持ち主を管理する。利用者が変わったら前の人の設定を捨てて読み直す（設計書 4.5・7章）
import { createSettingsStore, DEFAULT_SETTINGS } from './settings.js';

// getUserId：今の利用者の ID（未ログインは null）。onChange：読み直せたとき（画面を描き直す）
export function createSettingsHolder({ client, local, getUserId, onChange }) {
  let store = null; // 利用者ごとに1つ。読み込みに失敗したことを覚えて、その直後の保存を止めるため（5-7）
  let current = DEFAULT_SETTINGS;
  let owner; // current が誰の設定か（最初は未確定。未ログインの端末の値も最初に読む）

  const holder = {
    // 設定の入れ物（load・save）
    store() {
      const id = getUserId();
      if (!store || store.userId !== id) store = { userId: id, ...createSettingsStore({ client: client(), local, userId: id }) };
      return store;
    },
    get current() { return current; },
    // 今の利用者の設定として採用する（初回の設定・保存のあと）
    adopt(settings) { current = settings; owner = getUserId(); },
    // 利用者が変わっていたら、前の人の設定を捨てて読み直す。読み込みは、読み始めた利用者のままのときだけ使い、投げても落とさない
    async sync() {
      if (owner === getUserId()) return;
      owner = getUserId();
      current = DEFAULT_SETTINGS;
      const st = holder.store();
      try {
        const r = await st.load();
        if (st.userId === getUserId()) { current = r.settings; onChange(); }
      } catch { /* 既定値（未ログインなら端末の値）のまま */ }
    },
  };
  return holder;
}
