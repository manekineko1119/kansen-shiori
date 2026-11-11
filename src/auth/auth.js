// ログイン・ログアウト・管理者判定（設計書 7章、D24）。Supabase に触るのはデータ層のクライアントだけ
import { getClient } from '../data/client.js';
import { setReturnTo, takeReturnTo } from '../data/return-to.js';
import { SNAPSHOT_KEYS } from '../data/snapshot.js';
import { authErrorFromUrl, cleanAuthUrl, safeReturnTo, toAppUser } from '../core/auth-url.js';

// Google でログインする。戻り先（'#/…'）を覚えてから、# を含まないアプリの URL に戻す（PKCE）。
// returnTo が null なら、ルーターが覚えた戻り先をそのまま使う
export async function signInWithGoogle(returnTo = null) {
  if (returnTo) setReturnTo(returnTo);
  const { error } = await getClient().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: location.origin + location.pathname },
  });
  if (error) throw error;
}

// ログアウト。個人のスナップショットを消してから。検索履歴と端末の設定は残す（設計書 4.5）
export async function signOut({ snapshot, userId }) {
  if (userId) {
    try { await snapshot.remove(SNAPSHOT_KEYS.personal(userId)); } catch { /* 消せなくてもログアウトは進める */ }
  }
  await getClient().auth.signOut();
}

export async function getAppUser() {
  const { data } = await getClient().auth.getSession();
  return toAppUser(data?.session?.user ?? null);
}

// ログイン状態が変わったら cb(user, event)。有効期限が切れて更新できないと user は null になる
export function onAppUserChange(cb) {
  getClient().auth.onAuthStateChange((event, session) => cb(toAppUser(session?.user ?? null), event));
}

// 起動時に1回。ログインから戻った URL なら、セッションに換え終わるのを待ってから URL を片付ける
export async function handleAuthReturn() {
  const href = location.href;
  const url = new URL(href);
  const returned = url.searchParams.has('code') || authErrorFromUrl(href) !== null;
  if (!returned) return { returned: false, error: null, returnTo: null };
  const error = authErrorFromUrl(href);
  await getClient().auth.getSession(); // ?code= を supabase-js がセッションに換え終わるのを待つ
  history.replaceState(null, '', cleanAuthUrl(href));
  return { returned: true, error, returnTo: safeReturnTo(takeReturnTo()) };
}
