// 起動。画面の枠（メニュー・見出し・本文）を作り、幅の区分を data-size に入れる
import { watchSize } from './ui/size.js';
import { parseRoute, routeAccess } from './core/route.js';
import { startRouter } from './router.js';
import { renderFrame } from './ui/frame.js';
import { renderView } from './ui/views/index.js';
import { buildCtx } from './ui/ctx.js';
import { createViewState, routeKey, sameUserId, scrollPlan } from './ui/view-state.js';
import { rerender } from './ui/mount.js';
import { openKv } from './data/kv-idb.js';
import { createSnapshot } from './data/snapshot.js';
import { loadMasters } from './data/masters-loader.js';
import { refreshMasters } from './data/masters.js';
import { userFromAuth } from './auth/apply.js';
import { getClient } from './data/client.js';
import { createSettingsHolder } from './data/settings-holder.js';
import { createPersonalHolder } from './data/personal-holder.js';
import { createTripStore } from './data/trips.js';
import { createRecordStore } from './data/records.js';
import { createPhotoStore } from './data/photos.js';
import { createFixtureCache } from './data/fixture-cache.js';
import { createSeasonCache } from './data/season-cache.js';
import { createAdminStore } from './data/admin.js';
import { createAdminCache } from './data/admin-cache.js';
import { createHistory } from './data/history.js';
import { browserLocal } from './data/local.js';
import { setReturnTo } from './data/return-to.js';
import { getLastUser, setLastUser, clearLastUser } from './data/last-user.js';
import { handleAuthReturn, resolveAuth, onAppUserChange, signInWithGoogle, signOut } from './auth/auth.js';

const root = document.getElementById('app');
const state = createViewState(); // 入力中の値とスクロール位置（メモリ）
const local = browserLocal();
let currentRoute = null;
// ブラウザの自動のスクロール復元と、アプリの復元（scrollPlan）を取り違えないため
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
let masters = null; // 共通データの状態（readMastersSnapshot／refreshMasters の結果）
// { id, isAdmin, offline? } | null（画面の出し分けだけに使う。守りは RLS）。offline: true は、期限切れのままオフラインで、最後にログインしていた本人の写しを読み取りだけで出している状態（7章・9章）
let user = null;
// 利用者を替える。ID が変わるとき（別の人・未ログイン）は、前の人の入力中の値を捨てる（同じ ID なら残す）
function setUser(next) {
  if (!sameUserId(user, next)) { state.clearAll(); adminCache.reset(); }
  user = next;
  personal.sync(); // 利用者・状態が変わったら、前の人の個人データを捨てて読み直す
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
// 遠征予定・観戦記録（ログイン中だけ。オフラインは端末の写しだけ）。共通データが読めたら読み始める
const personal = createPersonalHolder({
  client: getClient, getSnapshot: () => snapshot, getUser: () => user, getMasters: () => masters, now: Date.now, onChange: () => redraw(),
});
const fixtureCache = createFixtureCache({ client: getClient, onChange: () => redraw() });
const seasonCache = createSeasonCache({ client: getClient, onChange: () => redraw() }); // 観戦記録の一覧：シーズンごとの試合
// 管理画面のテスター・取り込みの状況・写真の使用量と「今すぐ取り込む」の実行中（管理者だけ。守りは RLS と関数）
const adminCache = createAdminCache({ store: () => createAdminStore({ client: getClient() }), onChange: () => redraw() });
// 写真の Storage（ログイン中だけ。オフラインは出さない）。利用者が変わったら作り直す（署名付き URL の覚えも捨てる）
let photoStore = null;
let photoUserId = null;
function currentPhotos() {
  const id = user && !user.offline ? user.id : null;
  if (id !== photoUserId) { photoUserId = id; photoStore = id ? createPhotoStore({ client: getClient(), userId: id }) : null; }
  return photoStore;
}
const OFFLINE_NOTICE = 'オフラインのため、最後にログインしていたときの内容を表示しています。編集はできません';

// 共通データを最新に読み直して、画面を描き直す（管理者が試合の情報を保存したあと）
async function reloadMasters() {
  masters = await refreshMasters({ client: getClient(), snapshot, nowMs: Date.now() });
  personal.sync();
  seasonCache.reset(); // 保存した試合を含むシーズンを読み直す
  redraw();
}

// 画面の枠と本文を作って差し替える（スクロールは触らない）
function draw(route) {
  currentRoute = route;
  settings.sync(); // 利用者が変わっていたら設定を読み直す
  personal.sync();
  const ctx = buildCtx({
    route, state, user, masters, settings: settings.current, personal: personal.current, nowMs: Date.now(),
    data: {
      settings: settingsStore(),
      // 保存・読み込みのあとの採用。読み始めた利用者のままのときだけ（途中で利用者が変わった設定を採らない）
      adoptSettings: (s, forUserId) => { if (forUserId === (user?.id ?? null)) settings.adopt(s); },
      history: createHistory(local),
      trips: createTripStore({ client: getClient() }),
      photos: currentPhotos(),
      records: createRecordStore({ client: getClient(), photos: currentPhotos() }),
      fetchFixture: (id) => fixtureCache.get(id), // 共通データにない試合を ID で1件読む（undefined＝読み込み中、null＝なし）
      forgetFixture: (id) => fixtureCache.forget(id),
      seasons: () => seasonCache.seasons(), // シーズンの選択肢（undefined＝読み込み中、null＝読めない）
      seasonFixtures: (id) => seasonCache.fixtures(id), // 今のシーズン以外の試合（同上）
      seasonClubs: (id) => seasonCache.seasonClubs(id), // シーズンの所属クラブ（管理画面。同上）
      resetSeasons: () => seasonCache.resetSeasons(), // シーズンを作った・所属クラブを変えたあとに、覚えたものを捨てる
      admin: createAdminStore({ client: getClient() }), // 管理画面の保存（書けるのは管理者だけ。守りは RLS）
      adminCache, // 管理画面の読み取り（読み込み中は undefined）と「今すぐ取り込む」
      reloadMasters, // 試合の情報を保存したあとに、共通データを読み直す
      goLogin: () => { setReturnTo(location.hash || '#/search'); location.hash = '#/login'; }, // 今の画面を戻り先に覚えてログインへ
      reloadPersonal: () => personal.reload(), // 保存・削除の成功のあとに呼ぶ（D33）
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

// 画面の遷移：離れる画面の位置を残し、次の画面は scrollPlan に従って先頭・残した位置・そのまま
function renderApp(route) {
  const prev = currentRoute;
  if (prev) state.setScroll(routeKey(prev), window.scrollY);
  const key = routeKey(route);
  const plan = scrollPlan({ prev, next: route, size: document.documentElement.dataset.size ?? 'S', hasSaved: state.hasScroll(key) });
  draw(route);
  if (plan === 'top') window.scrollTo(0, 0);
  else if (plan === 'restore') requestAnimationFrame(() => window.scrollTo(0, state.getScroll(key)));
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
  loadMasters({ client: getClient(), snapshot, nowMs: Date.now(), onChange: (m) => { masters = m; personal.sync(); redraw(); } }).catch(() => {
    masters = { status: 'unavailable', message: '初回は通信できる場所で開いてください' };
    personal.sync();
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
