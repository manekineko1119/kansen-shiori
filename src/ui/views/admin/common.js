// 管理画面の共通の部品（クラブ・スタジアム・シーズン・テスター・取り込みなど。設計書 3.4）。この画面から src/data/・src/auth/ は読まない
import { el } from '../../components/parts.js';
import { formatDateJa, formatDateTimeJst } from '../../../core/format.js';

// 選んでいる項目は URL が持つ（D32）：#/admin/clubs?id=matsumoto、新規は ?new=1
export function selection(route) {
  const q = new URLSearchParams(route.query ?? '');
  const id = q.get('id');
  return { id: id === null || id === '' ? null : id, isNew: q.get('new') === '1' };
}

// 共通データがまだ読めていないとき・読めないときは、その旨の要素を返す（読めていれば null）
export function mastersGuard(ctx) {
  const { masters } = ctx;
  if (masters.status === 'loading') return el('p', { class: 'muted' }, '読み込み中です。');
  if (masters.status === 'unavailable') return el('p', { class: 'note', role: 'status' }, masters.message);
  return null;
}

// 保存を出せるか（オフラインのときは出さない。設計書 7章・9章）
export const canEdit = (ctx) => !ctx.user?.offline && ctx.masters.status !== 'offline';

export const backLink = (href, label) => el('a', { class: 'back', href }, label);

// 入力欄。id は a-<name>。options があれば select（[値, 表示] の配列）
export function ctrl(tag, name, value, attrs = {}) {
  const { options, ...rest } = attrs;
  const node = el(tag, { id: `a-${name}`, name, class: 'input', ...rest });
  if (options) for (const [v, label] of options) node.append(new Option(label, v));
  if (value !== undefined && value !== null) node.value = value;
  return node;
}

export function field(label, name, node, ...errNames) {
  return el('div', { class: 'field' }, el('label', { for: `a-${name}` }, label), node,
    errNames.map((n) => el('p', { class: 'err', 'data-err': n })));
}

export const textField = (label, name, value, locked, attrs = {}) =>
  field(label, name, ctrl('input', name, value, { type: 'text', autocomplete: 'off', disabled: locked, ...attrs }), name);

// 一覧の1行（選んでいる行は tint）。mark は右端の印
export function listRow({ href, label, sub, selected, mark }) {
  return el('a', { class: 'row', href, 'aria-current': selected ? 'true' : null },
    el('span', { class: 'row-main' }, el('span', { class: 'row-label' }, label), sub ? el('span', { class: 'row-sub muted' }, sub) : null),
    mark ? el('span', { class: 'cur' }, mark) : null,
    el('span', { class: 'row-mark', 'aria-hidden': 'true' }, '›'));
}

// 保存に成功した直後の「保存しました」（作り直しをまたいで、次の入力まで出す）
let flashAt = null;
export const setFlash = (section, id) => { flashAt = `${section}:${id}`; };
export const hasFlash = (section, id) => flashAt === `${section}:${id}`;
export const clearFlash = () => { flashAt = null; };

export const flashNote = (section, id) => (hasFlash(section, id) ? el('p', { class: 'note', role: 'status', 'data-flash': '' }, '保存しました') : null);

// 入力したら「保存しました」を消す
export function dropFlashOnInput(form) {
  form.addEventListener('input', () => { clearFlash(); form.querySelector('[data-flash]')?.remove(); });
}

// 管理画面の読み取りの結果（ctx.data.adminCache）：読み込み中・読めない・期限切れなら、その旨の要素を返す（読めていれば null）
export function loadGuard(ctx, res) {
  if (res === undefined) return el('p', { class: 'muted' }, '読み込み中です。');
  if (res === 'expired') {
    queueMicrotask(() => ctx.onExpired()); // 描いている途中で画面を移らない
    return el('p', { class: 'muted' }, 'ログインの有効期限が切れました。');
  }
  if (!res.ok) return el('p', { class: 'note', role: 'status' }, res.message);
  return null;
}

// 試合の短い名前（'11/8（土） 松本 vs 岐阜'）
export function matchLabel(ctx, f) {
  const name = (id) => ctx.masters.clubsById[id]?.short_name ?? id ?? '未定';
  return `${formatDateJa(f.match_date)} ${name(f.home_club_id)} vs ${name(f.away_club_id)}`;
}

// ISO の日時 → '2026/11/12 7:00'（日本時間）。読めなければ '－'
export const dateTimeText = (iso) => (iso ? formatDateTimeJst(iso) ?? '－' : '－');
