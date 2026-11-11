// 画面に渡す個人データ（ctx.personal）の持ち主。利用者が変わったら前の人のものを捨てて読み直す（設計書 4.5・7章、D33）
import { refreshPersonal, readPersonalSnapshot } from './personal.js';
import { offlineLabel } from './snapshot.js';

const FIRST_TIME_MESSAGE = '初回は通信できる場所で開いてください';

// getUser：今の利用者（{ id, offline? } | null）。getMasters：共通データの状態。getSnapshot：端末の写し。onChange：読めたとき（画面を描き直す）
export function createPersonalHolder({ client, getSnapshot, getUser, getMasters, now, onChange }) {
  let current = null; // null（未ログイン）| { status: 'loading' } | refreshPersonal の結果 | { status: 'offline', data, label }
  let key; // current がどの利用者・状態のものか

  const keyOf = (u) => (u ? `${u.id}:${u.offline ? 'offline' : 'online'}` : null);
  // 今のシーズンの試合の ID。共通データがまだなら null（読むのを待つ）。読めないと分かったら空
  function knownIds() {
    const m = getMasters();
    if (m?.data) return new Set(m.data.fixtures.map((f) => f.id));
    return m?.status === 'unavailable' ? new Set() : null;
  }

  // 読んで、読み始めた利用者のままのときだけ採用する
  async function run(user, k, ids) {
    const r = await refreshPersonal({ client: client(), snapshot: getSnapshot(), userId: user.id, nowMs: now(), knownFixtureIds: ids });
    if (keyOf(getUser()) !== k) return;
    current = r;
    onChange();
  }

  // オフライン：端末の写しだけを出す（通信しない）
  async function readOffline(user, k) {
    const old = await readPersonalSnapshot(getSnapshot(), user.id).catch(() => null);
    if (keyOf(getUser()) !== k) return;
    current = old ? { status: 'offline', data: old.data, label: offlineLabel(old.savedAt) } : { status: 'unavailable', message: FIRST_TIME_MESSAGE };
    onChange();
  }

  const holder = {
    get current() { return current; },
    // 利用者・状態が変わっていたら、前のものを捨てて読み始める（描くたびに呼んでよい）
    sync() {
      const user = getUser();
      const k = keyOf(user);
      if (k === key) return;
      if (!user) { key = k; current = null; return; }
      if (user.offline) { key = k; current = { status: 'loading' }; readOffline(user, k); return; }
      const ids = knownIds();
      current = { status: 'loading' }; // 前の人のものは必ず捨てる
      if (!ids) return; // 共通データを待つ（読めたら sync をもう一度呼ぶ）
      key = k;
      run(user, k, ids);
    },
    // 保存・削除の成功のあと：読み直す。差分では直さない（D33）。画面は読み直すまで今のものを出す
    async reload() {
      const user = getUser();
      const ids = knownIds();
      if (!user || user.offline || !ids) return;
      await run(user, keyOf(user), ids);
    },
  };
  return holder;
}
