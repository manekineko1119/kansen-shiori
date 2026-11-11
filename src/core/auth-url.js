// ログインから戻った URL の読み取り・後片付け、戻り先の確かめ、管理者の判定（設計書 7章、D24）。
// 純粋な関数だけ（DOM・location を触らない。URL は引数で受け取る）

const AUTH_PARAMS = ['code', 'error', 'error_code', 'error_description'];

// '#/…' でないハッシュ（Supabase が付ける '#error=…'）だけを読む
function authHash(url) {
  const h = url.hash.slice(1);
  return h === '' || h.startsWith('/') ? null : new URLSearchParams(h);
}

// 拒否されて戻ったか。フックの 403 は URL では access_denied になる（設計書 7.1）
export function authErrorFromUrl(href) {
  const url = new URL(href);
  const error = url.searchParams.get('error') ?? authHash(url)?.get('error') ?? null;
  if (!error) return null;
  return error === 'access_denied' ? 'not_invited' : 'failed';
}

// URL から code・error などを取り除く。ハッシュが '#error=…' なら '#/login' にする
export function cleanAuthUrl(href) {
  const url = new URL(href);
  for (const k of AUTH_PARAMS) url.searchParams.delete(k);
  const search = url.searchParams.toString();
  const hash = authHash(url) ? '#/login' : url.hash;
  return `${url.origin}${url.pathname}${search ? `?${search}` : ''}${hash}`;
}

// ログインのあとに戻す画面。アプリの中の画面（'#/…'）で、ログイン・初回の設定でないものだけ
export function safeReturnTo(value) {
  if (typeof value !== 'string' || !value.startsWith('#/')) return '#/search';
  const path = value.split('?')[0];
  if (path === '#/login' || path === '#/welcome') return '#/search';
  return value;
}

// 画面の出し分けに使う利用者。管理者は app_metadata.role だけで決める（守りは RLS。設計書 7.1）
export function toAppUser(user) {
  if (!user) return null;
  return { id: user.id, isAdmin: user.app_metadata?.role === 'admin' };
}

// getSession の結果 → ログインの状態（設計書 7章・9章）。
// 'signed_in'：ログイン中、'signed_out'：未ログインと確かめた、'unknown'：通信できず確かめられない。
// 期限切れのままオフラインで開くと、supabase-js は session null と AuthRetryableFetchError を返す。
// これを未ログインとみなすと、端末の写しを消してしまうので 'unknown' にする
export function authStateFrom(result) {
  if (result?.timedOut) return { status: 'unknown', user: null };
  const user = result?.session?.user ?? null;
  if (user) return { status: 'signed_in', user: toAppUser(user) };
  const e = result?.error;
  if (e && (e.name === 'AuthRetryableFetchError' || e.name === 'TypeError' || e.status === 0)) return { status: 'unknown', user: null };
  return { status: 'signed_out', user: null };
}
