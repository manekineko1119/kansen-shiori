// ログインの状態から、画面に出す user を決める（設計書 7章・9章）
import { setLastUser, clearLastUser } from '../data/last-user.js';

// auth：resolveAuth の結果。last：最後にログインしていた本人。戻り値は user（{ id, isAdmin, offline? } | null）
export async function userFromAuth(auth, last, snapshot) {
  if (auth.status === 'signed_in') {
    setLastUser(auth.user);
    return auth.user;
  }
  // 通信できず確かめられない：最後にログインしていた本人の写しを読み取りだけで出す。写しは消さない
  if (auth.status === 'unknown') return last ? { ...last, offline: true } : null;
  // 未ログインと確かめた：端末に残った個人の写しを消す（ログアウトで消せなかったとき。アカウントのデータには触れない）
  clearLastUser();
  await snapshot.removeAllPersonal().catch(() => 0);
  return null;
}
