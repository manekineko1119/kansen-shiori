// 起動。画面の枠（メニュー・見出し・本文）を作り、幅の区分を data-size に入れる
import { sizeClass, MEDIA } from './core/layout.js';
import { parseRoute, routeAccess } from './core/route.js';
import { startRouter } from './router.js';
import { renderNav, navKeyOf, ICONS } from './ui/components/nav.js';
import { renderPlaceholder, TITLES } from './ui/views/placeholder.js';
import { renderLogin } from './ui/views/login.js';
import { renderWelcome } from './ui/views/welcome.js';
import { createViewState, routeKey } from './ui/view-state.js';
import { rerender } from './ui/mount.js';
import { openKv } from './data/kv-idb.js';
import { createSnapshot } from './data/snapshot.js';
import { readMastersSnapshot, refreshMasters } from './data/masters.js';
import { getClient } from './data/client.js';
import { createSettingsStore } from './data/settings.js';
import { browserLocal } from './data/local.js';
import { setReturnTo } from './data/return-to.js';
import { getLastUser, setLastUser, clearLastUser } from './data/last-user.js';
import { handleAuthReturn, resolveAuth, onAppUserChange, signInWithGoogle, signOut } from './auth/auth.js';

const root = document.getElementById('app');
const state = createViewState(); // 入力中の値とスクロール位置（メモリ）
const local = browserLocal();
let currentRoute = null;
let masters = null; // 共通データの状態（readMastersSnapshot／refreshMasters の結果）
// { id, isAdmin, offline? } | null（画面の出し分けだけに使う。守りは RLS）。
// offline: true は、期限切れのままオフラインでログインを確かめられず、最後にログインしていた本人の写しを読み取りだけで出している状態（設計書 7章・9章）
let user = null;
let signingOut = false; // ログアウトの最中（SIGNED_OUT を期限切れと取り違えないため）
let loginError = null; // ログインから戻ったときのエラー（'not_invited' | 'failed'）
let welcomeSettings = null; // #/welcome の初期値（5-7 の load の settings）
let notice = null; // 画面の上に1回だけ出すお知らせ（ログアウトで端末の写しを消せなかったときなど）
// 何も覚えない Kv（IndexedDB が開けないとき。Safari のプライベートなど）
const nullKv = { get: async () => undefined, set: async () => {}, delete: async () => {} };
let snapshot = createSnapshot(nullKv);

function updateSize() {
  document.documentElement.dataset.size = sizeClass(window.innerWidth);
}

// 設定の入れ物は利用者ごとに1つ。読み込みに失敗したことを覚えて、その直後の保存を止めるため（5-7）
let store = null;
function settingsStore() {
  const id = user?.id ?? null;
  if (!store || store.userId !== id) store = { userId: id, ...createSettingsStore({ client: getClient(), local, userId: id }) };
  return store;
}
const OFFLINE_NOTICE = 'オフラインのため、最後にログインしていたときの内容を表示しています。編集はできません';

function topLinks() {
  const box = document.createElement('div');
  box.className = 'toplinks';
  if (user?.isAdmin) {
    const a = document.createElement('a');
    a.className = 'toplink';
    a.href = '#/admin';
    a.textContent = '管理';
    box.append(a);
  }
  const b = document.createElement(user ? 'button' : 'a');
  b.className = 'toplink';
  if (user) {
    b.type = 'button';
    b.textContent = 'ログアウト';
    b.addEventListener('click', doSignOut);
  } else {
    b.href = '#/login';
    b.textContent = 'ログイン';
    // 今の画面を戻り先に覚える（ログインのあと、この画面に戻る）
    b.addEventListener('click', () => { if (parseRoute(location.hash).name !== 'login') setReturnTo(location.hash || '#/search'); });
  }
  box.append(b);
  return box;
}

function view(route) {
  const key = routeKey(route);
  if (route.name === 'login') {
    return renderLogin({ error: loginError, user, onSignIn: () => signInWithGoogle(null), onSignOut: doSignOut });
  }
  if (route.name === 'welcome' && welcomeSettings) {
    return renderWelcome({
      settings: welcomeSettings,
      clubs: masters?.data?.clubs ?? [],
      state, key,
      onSave: async (values) => {
        const res = await settingsStore().save(values);
        if (res.ok) {
          welcomeSettings = null;
          location.hash = '#/search';
        }
        return res;
      },
    });
  }
  return renderPlaceholder(route, state, key, masters); // 段6 で本物の画面に差し替える
}

// 画面の枠と本文を作って差し替える（スクロールは触らない）
function draw(route) {
  currentRoute = route;
  const app = document.createElement('div');
  app.className = 'app';
  const col = document.createElement('div');
  col.className = 'col';
  const header = document.createElement('header');
  header.className = 'top';
  header.innerHTML = `<h1></h1><a class="gearbtn" href="#/settings" aria-label="設定">${ICONS.settings}</a>`;
  header.querySelector('h1').textContent = TITLES[route.name] ?? '観戦のしおり';
  header.querySelector('h1').after(topLinks());
  const main = document.createElement('main');
  for (const text of [user?.offline ? OFFLINE_NOTICE : null, notice]) {
    if (!text) continue;
    const p = document.createElement('p');
    p.className = 'note';
    p.setAttribute('role', 'status');
    p.textContent = text;
    main.append(p);
  }
  main.append(view(route));
  col.append(header, main);
  app.append(renderNav(navKeyOf(route.name)), col);
  root.replaceChildren(app);
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
      user = null;
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
  const { settings, exists } = await settingsStore().load();
  if (exists === false) {
    welcomeSettings = settings;
    return '#/welcome';
  }
  return returnTo;
}

// ログインの状態を当てはめる（設計書 7章・9章）
async function applyAuth(auth, last) {
  if (auth.status === 'signed_in') {
    user = auth.user;
    setLastUser(user);
    return;
  }
  if (auth.status === 'unknown') {
    // 通信できず確かめられない：最後にログインしていた本人の写しを読み取りだけで出す。写しは消さない
    user = last ? { ...last, offline: true } : null;
    return;
  }
  // 未ログインと確かめた：端末に残った個人の写しを消す（ログアウトで消せなかったとき。アカウントのデータには触れない）
  user = null;
  clearLastUser();
  await snapshot.removeAllPersonal().catch(() => 0);
}

// 今の画面をもう一度ルーターに通す（ログインの状態が変わったとき）
const recheckRoute = () => dispatchEvent(new HashChangeEvent('hashchange'));

async function start() {
  updateSize();
  for (const query of Object.values(MEDIA)) {
    matchMedia(query).addEventListener('change', () => { updateSize(); redraw(); }); // 入力とスクロールを残す
  }

  try { snapshot = createSnapshot(await openKv()); } catch { /* 保存なしで続ける */ }
  const last = getLastUser();

  let ret = { returned: false, error: null, returnTo: null };
  try { ret = await handleAuthReturn(); } catch { ret = { returned: true, error: 'failed', returnTo: '#/search' }; }

  if (ret.returned) {
    // ログインから戻ったとき（通信できている）：状態を確かめてから画面を出す
    await applyAuth(await resolveAuth(), last);
    if (ret.error || !user) {
      // 招待されていない、またはセッションに換えられなかった
      loginError = ret.error ?? 'failed';
      history.replaceState(null, '', '#/login');
    } else {
      history.replaceState(null, '', await afterSignIn(ret.returnTo));
    }
  } else {
    // ふつうの起動：ログインの確かめを待たずに画面を出す（最後にログインしていた本人として仮に出す）
    user = last;
  }

  // 有効期限が切れたら、ログインの必要な画面はログイン画面へ。戻ったら元の画面に戻す（9章）
  onAppUserChange((u) => {
    if (signingOut) return;
    const was = user;
    if (u) {
      user = u;
      setLastUser(u);
    } else if (was && !was.offline) {
      user = null;
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
  loadMasters().catch(() => {
    masters = { status: 'unavailable', message: '初回は通信できる場所で開いてください' };
    redraw();
  });

  if (!ret.returned) {
    // 裏でログインを確かめ、結果に合わせて画面を出し直す
    await applyAuth(await resolveAuth(), last);
    if (user && !user.offline && !welcomeSettings && parseRoute(location.hash).name === 'welcome') {
      welcomeSettings = (await settingsStore().load()).settings; // 初回の設定の途中で読み直したとき
    }
    if (!user && last && currentRoute && routeAccess(currentRoute.name, null) === 'login') setReturnTo(location.hash);
    recheckRoute();
  } else if (user && !welcomeSettings && parseRoute(location.hash).name === 'welcome') {
    welcomeSettings = (await settingsStore().load()).settings;
    redraw();
  }
}

// 共通データ：スナップショットで先に出し、裏で最新を取って差し替える（NFR-04）
async function loadMasters() {
  try {
    const old = await readMastersSnapshot(snapshot);
    if (old) {
      masters = { status: 'cached', data: old.data }; // 取得前。オフラインとは出さない
      redraw();
    }
  } catch {
    masters = null; // 描画で落ちたら、保存したものは使わず最新を取りにいく
  }
  masters = await refreshMasters({ client: getClient(), snapshot, nowMs: Date.now() });
  redraw();
}

// welcome を直接開いたとき（再読み込みなど）は、設定を読み直して初期値にする
addEventListener('hashchange', async () => {
  if (notice && parseRoute(location.hash).name !== 'search') notice = null; // お知らせはログアウト直後の画面だけ
  loginError = null; // ログインから戻ったときのエラーは、そのときの1回だけ出す
  const r = parseRoute(location.hash);
  if (r.name === 'welcome' && user && !user.offline && !welcomeSettings) {
    welcomeSettings = (await settingsStore().load()).settings;
    redraw();
  }
});

start();
