// 起動。画面の枠（メニュー・見出し・本文）を作り、幅の区分を data-size に入れる
import { watchSize } from './ui/size.js';
import { parseRoute, routeAccess } from './core/route.js';
import { startRouter } from './router.js';
import { renderFrame } from './ui/frame.js';
import { renderView } from './ui/views/index.js';
import { buildCtx } from './ui/ctx.js';
import { createViewState, routeKey, sameUserId } from './ui/view-state.js';
import { rerender } from './ui/mount.js';
import { openKv } from './data/kv-idb.js';
import { createSnapshot } from './data/snapshot.js';
import { loadMasters } from './data/masters-loader.js';
import { userFromAuth } from './auth/apply.js';
import { getClient } from './data/client.js';
import { createSettingsHolder } from './data/settings-holder.js';
import { createHistory } from './data/history.js';
import { browserLocal } from './data/local.js';
import { setReturnTo } from './data/return-to.js';
import { getLastUser, setLastUser, clearLastUser } from './data/last-user.js';
import { handleAuthReturn, resolveAuth, onAppUserChange, signInWithGoogle, signOut } from './auth/auth.js';

const root = document.getElementById('app');
const state = createViewState(); // 入力中の値とスクロール位置（メモリ）
const local = browserLocal();
let currentRoute = null;
let masters = null; // 共通データの状態（readMastersSnapshot／refreshMasters の結果）
// { id, isAdmin, offline? } | null（画面の出し分けだけに使う。守りは RLS）。offline: true は、期限切れのままオフラインで、最後にログインしていた本人の写しを読み取りだけで出している状態（7章・9章）
let user = null;
// 利用者を替える。ID が変わるとき（別の人・未ログイン）は、前の人の入力中の値を捨てる（同じ ID なら残す）
function setUser(next) {
  if (!sameUserId(user, next)) state.clearAll();
  user = next;
}
let signingOut = false; // ログアウトの最中（SIGNED_OUT を期限切れと取り違えないため）
let loginError = null; // ログインから戻ったときのエラー（'not_invited' | 'failed'）
let welcomeSettings = null; // #/welcome の初期値（5-7 の load の settings）
let notice = null; // 画面の上に1回だけ出すお知らせ（ログアウトで端末の写しを消せなかったときなど）
// 何も覚えない Kv（IndexedDB が開けないとき。Safari のプライベートなど）
const nullKv = { get: async () => undefined, set: async () => {}, delete: async () => {} };
let snapshot = createSnapshot(nullKv);

const settings = createSettingsHolder({ client: getClient, local, getUserId: () => user?.id ?? null, onChange: () => redraw() });
const settingsStore = () => settings.store();
const OFFLINE_NOTICE = 'オフラインのため、最後にログインしていたときの内容を表示しています。編集はできません';

// 画面の枠と本文を作って差し替える（スクロールは触らない）
function draw(route) {
  currentRoute = route;
  settings.sync(); // 利用者が変わっていたら設定を読み直す
  const ctx = buildCtx({
    route, state, user, masters, settings: settings.current, nowMs: Date.now(),
    data: {
      settings: settingsStore(),
      // 保存・読み込みのあとの採用。読み始めた利用者のままのときだけ（途中で利用者が変わった設定を採らない）
      adoptSettings: (s, forUserId) => { if (forUserId === (user?.id ?? null)) settings.adopt(s); },
      history: createHistory(local),
    },
    navigate: (hash) => { location.hash = hash; },
    redraw,
    onExpired: () => { setReturnTo(location.hash); location.hash = '#/login'; },
    auth: { loginError, signIn: () => signInWithGoogle(null), signOut: doSignOut },
    welcome: { settings: welcomeSettings, save: saveWelcome },
  });
  root.replaceChildren(renderFrame({
    route, user, notices: [user?.offline ? OFFLINE_NOTICE : null, notice],
    body: renderView(ctx),
    // 今の画面を戻り先に覚える（ログインのあと、この画面に戻る）
    onLogin: () => { if (parseRoute(location.hash).name !== 'login') setReturnTo(location.hash || '#/search'); },
  }));
}

// 初回の設定の保存。成功したら検索画面へ
async function saveWelcome(values) {
  const res = await settingsStore().save(values);
  if (res.ok) {
    settings.adopt(res.settings);
    welcomeSettings = null;
    location.hash = '#/search';
  }
  return res;
}

// 画面の遷移：先頭から始める
function renderApp(route) {
  draw(route);
  window.scrollTo(0, 0);
}

const redraw = () => { if (currentRoute) rerender(state, routeKey(currentRoute), () => draw(currentRoute)); };

async function doSignOut() {
  signingOut = true;
  try {
    const { cleaned, signedOut } = await signOut({ snapshot, userId: user?.id });
    if (!signedOut) notice = 'ログアウトできませんでした（通信できません）。通信できる場所でもう一度ログアウトしてください';
    else if (!cleaned) notice = 'ログアウトしました。ただし、この端末の遠征予定・観戦記録の写しを消せませんでした。次に開いたときにもう一度消します（アカウントのデータはそのままです）';
    if (signedOut) {
      setUser(null);
      clearLastUser();
    }
  } finally {
    signingOut = false;
    // ログアウトのあとは検索画面へ。すでに検索画面なら、hashchange が起きないので描き直す
    if (parseRoute(location.hash).name === 'search') renderApp(parseRoute(location.hash));
    else location.hash = '#/search';
  }
}

// ログインした直後：user_settings がなければ初回の設定へ（7.3）。読めなかったときは端末の設定で続ける（5-7）
async function afterSignIn(returnTo) {
  const { settings: loaded, exists } = await settingsStore().load();
  settings.adopt(loaded);
  if (exists === false) {
    welcomeSettings = loaded;
    return '#/welcome';
  }
  return returnTo;
}

// welcome の初期値：設定を読み直す。画面に渡す設定も同じ値にする
async function loadWelcome() {
  welcomeSettings = (await settingsStore().load()).settings;
  settings.adopt(welcomeSettings);
}

// 今の画面をもう一度ルーターに通す（ログインの状態が変わったとき）
const recheckRoute = () => dispatchEvent(new HashChangeEvent('hashchange'));

async function start() {
  watchSize(redraw); // 幅が変わっても、入力とスクロールを残す

  try { snapshot = createSnapshot(await openKv()); } catch { /* 保存なしで続ける */ }
  const last = getLastUser();

  let ret = { returned: false, error: null, returnTo: null };
  try { ret = await handleAuthReturn(); } catch { ret = { returned: true, error: 'failed', returnTo: '#/search' }; }

  if (ret.returned) {
    // ログインから戻ったとき（通信できている）：状態を確かめてから画面を出す
    setUser(await userFromAuth(await resolveAuth(), last, snapshot));
    if (ret.error || !user) {
      // 招待されていない、またはセッションに換えられなかった
      loginError = ret.error ?? 'failed';
      history.replaceState(null, '', '#/login');
    } else {
      history.replaceState(null, '', await afterSignIn(ret.returnTo));
    }
  } else {
    // ふつうの起動：ログインの確かめを待たずに画面を出す（最後にログインしていた本人として仮に出す）
    setUser(last);
  }

  // 有効期限が切れたら、ログインの必要な画面はログイン画面へ。戻ったら元の画面に戻す（9章）
  onAppUserChange((u) => {
    if (signingOut) return;
    const was = user;
    if (u) {
      setUser(u);
      setLastUser(u);
    } else if (was && !was.offline) {
      setUser(null);
      if (currentRoute && routeAccess(currentRoute.name, null) === 'login') {
        setReturnTo(location.hash);
        location.hash = '#/login';
        return;
      }
    } else {
      return; // オフラインで読み取りだけのときは、そのまま
    }
    if ((was?.id ?? null) !== (u?.id ?? null) || (was?.isAdmin ?? false) !== (u?.isAdmin ?? false) || was?.offline) redraw();
  });

  startRouter({ render: renderApp, getUser: () => user });
  loadMasters({ client: getClient(), snapshot, nowMs: Date.now(), onChange: (m) => { masters = m; redraw(); } }).catch(() => {
    masters = { status: 'unavailable', message: '初回は通信できる場所で開いてください' };
    redraw();
  });

  if (!ret.returned) {
    // 裏でログインを確かめ、結果に合わせて画面を出し直す
    setUser(await userFromAuth(await resolveAuth(), last, snapshot));
    if (user && !user.offline && !welcomeSettings && parseRoute(location.hash).name === 'welcome') {
      await loadWelcome(); // 初回の設定の途中で読み直したとき
    }
    if (!user && last && currentRoute && routeAccess(currentRoute.name, null) === 'login') setReturnTo(location.hash);
    recheckRoute();
  } else if (user && !welcomeSettings && parseRoute(location.hash).name === 'welcome') {
    await loadWelcome();
    redraw();
  }
}

// welcome を直接開いたとき（再読み込みなど）は、設定を読み直して初期値にする
addEventListener('hashchange', async () => {
  if (notice && parseRoute(location.hash).name !== 'search') notice = null; // お知らせはログアウト直後の画面だけ
  loginError = null; // ログインから戻ったときのエラーは、そのときの1回だけ出す
  const r = parseRoute(location.hash);
  if (r.name === 'welcome' && user && !user.offline && !welcomeSettings) {
    await loadWelcome();
    redraw();
  }
});

start();
