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
import { handleAuthReturn, getAppUser, onAppUserChange, signInWithGoogle, signOut } from './auth/auth.js';

const root = document.getElementById('app');
const state = createViewState(); // 入力中の値とスクロール位置（メモリ）
const local = browserLocal();
let currentRoute = null;
let masters = null; // 共通データの状態（readMastersSnapshot／refreshMasters の結果）
let user = null; // { id, isAdmin } | null（画面の出し分けだけに使う。守りは RLS）
let loginError = null; // ログインから戻ったときのエラー（'not_invited' | 'failed'）
let welcomeSettings = null; // #/welcome の初期値（5-7 の load の settings）
let notice = null; // 画面の上に1回だけ出すお知らせ（ログアウトで端末の写しを消せなかったときなど）
// 何も覚えない Kv（IndexedDB が開けないとき。Safari のプライベートなど）
const nullKv = { get: async () => undefined, set: async () => {}, delete: async () => {} };
let snapshot = createSnapshot(nullKv);

function updateSize() {
  document.documentElement.dataset.size = sizeClass(window.innerWidth);
}

const settingsStore = () => createSettingsStore({ client: getClient(), local, userId: user?.id ?? null });

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
  if (notice) {
    const p = document.createElement('p');
    p.className = 'note';
    p.setAttribute('role', 'status');
    p.textContent = notice;
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
  try {
    const { cleaned } = await signOut({ snapshot, userId: user?.id });
    if (!cleaned) notice = 'ログアウトしました。ただし、この端末の遠征予定・観戦記録の写しを消せませんでした。次に開いたときにもう一度消します（アカウントのデータはそのままです）';
  } finally {
    user = null;
    location.hash = '#/search';
    redraw();
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

async function start() {
  updateSize();
  for (const query of Object.values(MEDIA)) {
    matchMedia(query).addEventListener('change', () => { updateSize(); redraw(); }); // 入力とスクロールを残す
  }

  try { snapshot = createSnapshot(await openKv()); } catch { /* 保存なしで続ける */ }
  // ログインしていないのに個人の写しが残っていたら消す（ログアウトで消せなかったとき。アカウントのデータには触れない）
  if (!(await getAppUser().catch(() => null))) await snapshot.removeAllPersonal().catch(() => 0);

  let ret = { returned: false, error: null, returnTo: null };
  try { ret = await handleAuthReturn(); } catch { ret = { returned: true, error: 'failed', returnTo: '#/search' }; }
  try { user = await getAppUser(); } catch { user = null; }
  if (ret.error) {
    loginError = ret.error;
    history.replaceState(null, '', '#/login');
  } else if (ret.returned && user) {
    history.replaceState(null, '', await afterSignIn(ret.returnTo));
  }
  if (user && !welcomeSettings && parseRoute(location.hash).name === 'welcome') {
    welcomeSettings = (await settingsStore().load()).settings; // 初回の設定の途中で読み直したとき
  }

  // 有効期限が切れたら、ログインの必要な画面はログイン画面へ。戻ったら元の画面に戻す（9章）
  onAppUserChange((u) => {
    const was = user;
    user = u;
    if (was && !u && currentRoute && routeAccess(currentRoute.name, null) === 'login') {
      setReturnTo(location.hash);
      location.hash = '#/login';
      return;
    }
    if ((was?.id ?? null) !== (u?.id ?? null) || (was?.isAdmin ?? false) !== (u?.isAdmin ?? false)) redraw();
  });

  startRouter({ render: renderApp, getUser: () => user });
  loadMasters().catch(() => {
    masters = { status: 'unavailable', message: '初回は通信できる場所で開いてください' };
    redraw();
  });
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
  if (r.name === 'welcome' && user && !welcomeSettings) {
    welcomeSettings = (await settingsStore().load()).settings;
    redraw();
  }
});

start();
