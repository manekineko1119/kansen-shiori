// 設定（#/settings。設計書 3章、FR-30・31）：応援クラブ・出発駅・出発空港・余裕の時間・交通手段の初期値
// データ層は ctx から使う（src/data/・src/auth/ を import しない。D29）。保存は「load のあとの同じ入れ物」で行う
import { el, innerLink } from '../components/parts.js';
import { bindForm } from '../mount.js';
import { settingsFromForm, airportRowIndexes, requiredErrors, MAX_AIRPORTS } from '../../core/settings-form.js';
import { validateSettings } from '../../core/validate.js';
import { TOYOKO_PREFECTURE_CODES } from '../../core/links/toyoko-inn.js';

const AP_FIELDS = ['code', 'name', 'station', 'access_min', 'note'];
const MODES = [['train', '電車'], ['car', '車'], ['bus', '高速バス'], ['plane', '飛行機']];
const LOAD_FAILED = '設定を読み込めませんでした。通信できる場所で開き直してください';

// 入れ物ごとの読み込みの状態（'loading' | 'ok' | 'failed'）。画面を作り直しても読み直さない
const loadState = new WeakMap();
let flash = false; // 保存に成功した直後の「保存しました」（作り直しをまたいで、次の入力まで出す）

// 入力欄の今の値（name → 文字列。チェックは true/false）
function readValues(form) {
  const values = {};
  for (const f of form.elements) {
    if (!f.name || f.type === 'file') continue;
    values[f.name] = f.type === 'checkbox' ? f.checked : f.value;
  }
  return values;
}

function control(tag, name, value, attrs = {}) {
  const node = el(tag, { id: `s-${name}`, name, class: 'input', ...attrs });
  if (value != null) node.value = value;
  return node;
}

function field(label, name, node, ...errNames) {
  return el('div', { class: 'field' }, el('label', { for: `s-${name}` }, label), node,
    errNames.map((n) => el('p', { class: 'err', 'data-err': n })));
}

const textInput = (name, value, disabled) => control('input', name, value, { type: 'text', autocomplete: 'off', disabled });
const numberInput = (name, value, disabled) => control('input', name, value, { type: 'text', inputmode: 'numeric', autocomplete: 'off', disabled });

// 保存の理由のキー（origin_airports.<保存される順>.x）を、画面の行の番号に直す
function toRowKeys(errors, rows) {
  const out = {};
  for (const [k, msg] of Object.entries(errors ?? {})) {
    const m = /^origin_airports\.(\d+)\.(.+)$/.exec(k);
    out[m ? `origin_airports.${rows[Number(m[1])] ?? m[1]}.${m[2]}` : k] = msg;
  }
  return out;
}

export function renderSettings(ctx) {
  const { settings, state, key, user } = ctx;
  const offline = Boolean(user?.offline);
  const store = ctx.data.settings;
  const status = offline ? 'ok' : loadState.get(store);

  // 開いたら、まず読む（読めていない設定で保存して、アカウントの設定を上書きしないため）
  function startLoad() {
    loadState.set(store, 'loading');
    const userId = store.userId ?? null;
    store.load().then((r) => {
      loadState.set(store, r.exists === null ? 'failed' : 'ok');
      if (r.exists !== null) ctx.data.adoptSettings(r.settings, userId);
    }, () => loadState.set(store, 'failed')).then(() => ctx.redraw());
  }
  if (status === undefined) startLoad();
  const loading = status === undefined || status === 'loading';

  const clubs = ctx.masters.data?.clubs ?? [];
  const clubList = clubs.some((c) => c.id === settings.support_club_id) ? clubs : [...clubs, { id: settings.support_club_id, name: settings.support_club_id }];
  const prefectures = Object.keys(TOYOKO_PREFECTURE_CODES);
  if (!prefectures.includes(settings.origin_prefecture)) prefectures.push(settings.origin_prefecture);

  const saved = state.getForm(key);
  const count = Math.min(Math.max(Number(saved.airport_count ?? settings.origin_airports.length) || 0, 0), MAX_AIRPORTS);

  const clubSelect = control('select', 'support_club_id', null, { disabled: offline });
  for (const c of clubList) clubSelect.append(new Option(c.name, c.id));
  clubSelect.value = settings.support_club_id;
  const prefSelect = control('select', 'origin_prefecture', null, { disabled: offline });
  for (const p of prefectures) prefSelect.append(new Option(p, p));
  prefSelect.value = settings.origin_prefecture;

  function airportRow(i) {
    const a = settings.origin_airports[i] ?? {};
    const n = (f) => `airport_${i}_${f}`;
    return el('fieldset', { class: 'airrow' },
      el('legend', null, `空港 ${i + 1}`),
      el('div', { class: 'row2' },
        field('コード（MMJ など）', n('code'), control('input', n('code'), a.code, { type: 'text', autocomplete: 'off', autocapitalize: 'characters', disabled: offline }), `origin_airports.${i}.code`),
        field('所要時間（分）', n('access_min'), numberInput(n('access_min'), a.access_min, offline), `origin_airports.${i}.access_min`)),
      field('名前', n('name'), textInput(n('name'), a.name, offline)),
      field('駅（乗換案内の到着駅。空でも可）', n('station'), textInput(n('station'), a.station, offline)),
      field('メモ', n('note'), textInput(n('note'), a.note, offline)),
      offline ? null : el('button', { class: 'btn btn-sub btn-small', type: 'button', onclick: () => removeRow(i) }, `空港 ${i + 1} を削除`));
  }

  const form = el('form', { class: 'sec', novalidate: true },
    el('h2', null, '検索の初期値'),
    field('応援クラブ', 'support_club_id', clubSelect, 'support_club_id'),
    el('div', { class: 'row2' },
      field('出発駅', 'origin_station', textInput('origin_station', settings.origin_station, offline), 'origin_station'),
      field('都道府県', 'origin_prefecture', prefSelect, 'origin_prefecture')),
    el('input', { type: 'hidden', name: 'airport_count', value: String(count) }),
    el('h2', null, '出発空港'),
    el('p', { class: 'muted' }, '飛行機で行くときの出発地です（最大5件）。'),
    Array.from({ length: count }, (_, i) => airportRow(i)),
    offline ? null : el('button', { class: 'btn btn-sub', type: 'button', disabled: count >= MAX_AIRPORTS, onclick: addRow }, '＋ 空港を追加'),
    el('h2', null, '余裕の時間'),
    el('div', { class: 'row2' },
      field('空港に着くのは便の何分前（分）', 'airport_checkin_min', numberInput('airport_checkin_min', settings.airport_checkin_min, offline), 'airport_checkin_min'),
      field('着陸から空港を出るまで（分）', 'airport_arrival_min', numberInput('airport_arrival_min', settings.airport_arrival_min, offline), 'airport_arrival_min')),
    field('キックオフの何分前に着くか（分）', 'arrive_before_min', numberInput('arrive_before_min', settings.arrive_before_min, offline), 'arrive_before_min'),
    el('h2', null, 'よく使う交通手段'),
    el('div', null, MODES.map(([m, label]) => el('label', { class: 'check' },
      el('input', { type: 'checkbox', name: `mode_${m}`, checked: settings.default_modes.includes(m), disabled: offline }), el('span', null, label)))),
    el('p', { class: 'err', 'data-err': 'default_modes' }),
    el('p', { class: 'err', 'data-err': '_form', role: 'alert' }, status === 'failed' ? LOAD_FAILED : ''),
    flash ? el('p', { class: 'note', role: 'status', 'data-flash': '' }, '保存しました') : null,
    offline ? el('p', { class: 'muted' }, 'オフラインのため、保存できません。')
      : el('button', { class: 'btn', type: 'submit', disabled: loading }, loading ? '読み込み中…' : '設定を保存'),
    status === 'failed' ? el('button', { class: 'btn btn-sub', type: 'button', onclick: () => { startLoad(); ctx.redraw(); } }, '読み込み直す') : null);

  // 行の増減は state に入れて作り直す（入力中の値も行の数も残る）
  function addRow() {
    const next = { ...readValues(form), airport_count: String(count + 1) };
    for (const f of AP_FIELDS) next[`airport_${count}_${f}`] = '';
    state.setForm(key, next);
    ctx.redraw();
  }
  function removeRow(i) {
    const next = readValues(form);
    for (let j = i; j < count - 1; j += 1) for (const f of AP_FIELDS) next[`airport_${j}_${f}`] = next[`airport_${j + 1}_${f}`];
    for (const f of AP_FIELDS) next[`airport_${count - 1}_${f}`] = '';
    next.airport_count = String(count - 1);
    state.setForm(key, next);
    ctx.redraw();
  }

  const showErrors = (errors) => {
    for (const [k, msg] of Object.entries(errors)) {
      (form.querySelector(`[data-err="${k}"]`) ?? form.querySelector('[data-err="_form"]')).textContent = msg;
    }
  };

  bindForm(form, state, key); // 開閉・回転で入力を残す（段6 の約束）
  form.addEventListener('input', () => { flash = false; form.querySelector('[data-flash]')?.remove(); });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (offline || loading) return;
    for (const p of form.querySelectorAll('[data-err]')) p.textContent = '';
    flash = false;
    const values = readValues(form);
    const next = settingsFromForm(values, settings);
    const rows = airportRowIndexes(values);
    const local = { ...toRowKeys(validateSettings(next).errors, rows), ...requiredErrors(next) };
    if (Object.keys(local).length) { showErrors(local); return; }
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; // 保存中は2回押せない
    let res;
    try {
      res = await store.save(next);
    } finally {
      btn.disabled = false;
    }
    if (res.ok) {
      flash = true;
      state.clearForm(key);
      ctx.data.adoptSettings(res.settings, store.userId ?? null);
      ctx.redraw();
      return;
    }
    if (res.expired) { ctx.onExpired(); return; }
    showErrors(toRowKeys(res.errors, rows));
  });

  return el('div', { class: 'two-col even' }, form, accountSection(ctx));
}

// アカウント：未ログインは端末に保存する説明、ログイン中はログアウトと（管理者は）管理へのリンク
function accountSection({ user, auth }) {
  const box = el('section', { class: 'sec' }, el('h2', null, 'アカウント'));
  if (!user) {
    box.append(el('p', null, 'この端末に保存します。ログインするとアカウントに保存され、ほかの端末でも使えます'),
      el('a', { class: 'btn btn-sub', href: '#/login' }, 'ログイン'));
    return box;
  }
  box.append(el('p', null, 'ログイン中です。設定はアカウントに保存され、ほかの端末でも使えます。'));
  if (user.isAdmin) box.append(innerLink({ href: '#/admin', label: '管理', sub: 'クラブ・スタジアム・日程・取り込み' }));
  box.append(el('button', { class: 'btn btn-sub', type: 'button', onclick: auth.signOut }, 'ログアウト'));
  return box;
}
