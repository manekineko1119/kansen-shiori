// ログイン・ログアウト・管理者判定（設計書 7章、D24）。Supabase に触るのはデータ層のクライアントだけ
import { getClient } from '../data/client.js';
import { setReturnTo, takeReturnTo } from '../data/return-to.js';
import { SNAPSHOT_KEYS } from '../data/snapshot.js';
import { authErrorFromUrl, cleanAuthUrl, safeReturnTo, toAppUser, authStateFrom } from '../core/auth-url.js';

// Google でログインする。戻り先（'#/…'）を覚えてから、# を含まないアプリの URL に戻す（PKCE）。
// returnTo が null なら、ルーターが覚えた戻り先をそのまま使う
export async function signInWithGoogle(returnTo = null) {
  if (returnTo) setReturnTo(returnTo);
  const { error } = await getClient().auth.signInWithOAuth({
    provider: 'google',
    // select_account：Google にログイン中でも、毎回アカウントを選べるようにする（複数のアカウントを持つ人のため）
    options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } },
  });
  if (error) throw error;
}

// ログアウト。端末の個人の写しを消してから。検索履歴と端末の設定は残す（設計書 4.5）。
// アカウントのデータ（遠征予定・観戦記録・設定）には触れない。
// 写しを消せなくてもログアウトは進め、{ cleaned: false } を返す（次に開いたときに removeAllPersonal で消す）
export async function signOut({ snapshot, userId }) {
  let cleaned = true;
  if (userId) {
    try { await snapshot.remove(SNAPSHOT_KEYS.personal(userId)); } catch { cleaned = false; }
  }
  // 期限切れのままオフラインだと、supabase-js は端末のセッションを消さずに error を返す
  let signedOut = true;
  try {
    const { error } = await getClient().auth.signOut();
    if (error) signedOut = false;
  } catch {
    signedOut = false;
  }
  return { cleaned, signedOut };
}

// 期限切れ（サーバーが JWT を受け付けない）とき、端末のセッションだけを捨てる（サーバーには送らない）。
// 捨てないと、端末は「ログイン中」のままでログイン画面にログインのボタンが出ない（段6 のまとめのレビュー I-1）
export async function dropLocalSession() {
  try { await getClient().auth.signOut({ scope: 'local' }); } catch { /* 捨てられなくても、画面は未ログインとして進める */ }
}

// ログインの状態を確かめる：{ status: 'signed_in' | 'signed_out' | 'unknown', user }。
// 期限切れのままオフラインだと getSession は約30秒くり返すので、timeoutMs で打ち切って 'unknown' にする
export async function resolveAuth({ timeoutMs = 3000 } = {}) {
  let timer;
  const timeout = new Promise((res) => { timer = setTimeout(() => res({ timedOut: true }), timeoutMs); });
  try {
    const r = await Promise.race([
      getClient().auth.getSession().then((x) => ({ session: x?.data?.session ?? null, error: x?.error ?? null }), (e) => ({ session: null, error: e })),
      timeout,
    ]);
    return authStateFrom(r);
  } finally {
    clearTimeout(timer);
  }
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
