// 最後にログインしていた本人（{ id, isAdmin }）を端末に覚える（設計書 7章・9章）。
// 期限切れのままオフラインで開いたとき、この人の写しを読み取りだけで出すために使う。
// ブラウザの保存領域を触るのは src/data/ だけ
import { browserLocal } from './local.js';

const KEY = 'kansen.lastUser';

export function getLastUser() {
  try {
    const v = JSON.parse(browserLocal().getItem(KEY));
    return v && typeof v.id === 'string' && v.id !== '' ? { id: v.id, isAdmin: v.isAdmin === true } : null;
  } catch {
    return null;
  }
}

export function setLastUser(user) {
  try { browserLocal().setItem(KEY, JSON.stringify({ id: user.id, isAdmin: user.isAdmin === true })); } catch { /* 覚えられなくても動く */ }
}

export function clearLastUser() {
  try { browserLocal().removeItem(KEY); } catch { /* 消せなくても動く */ }
}
