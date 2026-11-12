// 遠征予定の入力（詳細・編集と新規で共通）。設計書 3章・5.2.1、FR-24〜26
// 保存・削除は ctx.data.trips、保存のあとの読み直しは ctx.data.reloadPersonal()（D33）。この画面から src/data/ は読まない
import { el, innerLink } from '../components/parts.js';
import { bindForm } from '../mount.js';
import { readValues, createRunner } from '../components/form-util.js';
import { tripFormValues, tripFromForm, fixtureOptions } from '../../core/trip-view.js';
import { isTripPast } from '../../core/trips.js';
import { buildResultQuery } from '../../core/search-query.js';
import { MODE_NAMES, LODGING_NAMES } from '../../core/search-form.js';

const CONFIRM_DELETE = 'この遠征予定を削除しますか';
let flashId = null; // 保存に成功した直後の「保存しました」を出す遠征予定の ID（作り直しをまたぐ。次の入力で消す）

const control = (tag, name, attrs = {}) => el(tag, { id: `t-${name}`, name, class: 'input', ...attrs });
const field = (label, name, node, err = name) => el('div', { class: 'field' }, el('label', { for: `t-${name}` }, label), node, el('p', { class: 'err', 'data-err': err }));

// 「この条件で検索」の条件（保存済みの遠征予定から）
function searchQuery(trip) {
  return trip.fixture_id
    ? buildResultQuery({ fixtureId: trip.fixture_id, modes: trip.modes, lodging: trip.lodging })
    : buildResultQuery({ custom: { date: trip.custom_date, venue: trip.custom_venue }, modes: trip.modes, lodging: trip.lodging });
}

/**
 * @param ctx 画面の ctx
 * @param opts.trip 保存済みの遠征予定（新規は null）
 * @param opts.initial 入力欄の初期値のもとになる遠征予定（trip か、結果画面の下書き）。なければ空
 * @param opts.env { fixturesById（extraFixtures を合わせたもの）, clubsById, supportClubId }
 */
export function renderTripForm(ctx, { trip, initial, env }) {
  const { state, key } = ctx;
  const offline = Boolean(ctx.user?.offline);
  const values = tripFormValues(initial ?? {});
  const isNew = !trip;

  const fixture = control('select', 'fixture_id', { disabled: offline });
  fixture.append(new Option('試合を選ばない（会場と日付を入力）', ''));
  for (const o of fixtureOptions({ ...env, selectedId: values.fixture_id || null })) fixture.append(new Option(o.label, o.value));
  fixture.value = values.fixture_id;

  const radios = Object.entries(LODGING_NAMES).map(([v, label]) => el('label', { class: 'check' },
    el('input', { type: 'radio', name: 'lodging', value: v, checked: values.lodging === v, disabled: offline }), el('span', null, label)));
  const checks = Object.entries(MODE_NAMES).map(([m, label]) => el('label', { class: 'check' },
    el('input', { type: 'checkbox', name: `mode_${m}`, checked: values[`mode_${m}`], disabled: offline }), el('span', null, label)));

  const text = (name, label, extra = {}) => field(label, name, control('input', name, { type: 'text', autocomplete: 'off', value: values[name], disabled: offline, ...extra }));
  const form = el('form', { class: 'sec trip-form', novalidate: true },
    el('h2', null, isNew ? '遠征予定を作る' : '遠征予定'),
    text('title', 'タイトル（50文字まで）'),
    field('試合', 'fixture_id', fixture),
    el('p', { class: 'muted' }, '日程にない試合・会場のときは、試合を選ばず、下に会場と日付を入力します。'),
    text('custom_venue', '会場（試合を選ばないとき）'),
    field('日付（試合を選ばないとき）', 'custom_date', control('input', 'custom_date', { type: 'date', value: values.custom_date, disabled: offline })),
    el('fieldset', { class: 'field grp' }, el('legend', null, '交通手段'), el('div', { class: 'radios' }, checks)),
    el('fieldset', { class: 'field grp' }, el('legend', null, '宿泊'), el('div', { class: 'radios' }, radios)),
    text('transport_memo', '交通のメモ'),
    text('lodging_memo', '宿のメモ'),
    field('メモ', 'memo', control('textarea', 'memo', { rows: '4', disabled: offline })),
    el('p', { class: 'err', 'data-err': '_form', role: 'alert' }),
    flashId && trip && flashId === trip.id ? el('p', { class: 'note', role: 'status', 'data-flash': '' }, '保存しました') : null,
    offline ? el('p', { class: 'muted' }, 'オフラインのため、保存・削除はできません。')
      : el('button', { class: 'btn', type: 'submit' }, isNew ? '遠征予定を作成' : '変更を保存'));
  form.elements.memo.value = values.memo;

  bindForm(form, state, key); // 開閉・回転で入力を残す（段6 の約束）
  form.addEventListener('input', () => { flashId = null; form.querySelector('[data-flash]')?.remove(); });

  const run = createRunner(ctx, form, 'trip-form'); // 失敗の理由は view-state に覚える（M-6）

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (offline) return;
    const next = tripFromForm(readValues(form), trip?.id ?? null);
    run(() => ctx.data.trips.save(next), form.querySelector('button[type="submit"]'), async (res) => {
      flashId = res.id;
      state.clearForm(key);
      await ctx.data.reloadPersonal();
      if (isNew) ctx.navigate(`#/trips/${encodeURIComponent(res.id)}`);
      else ctx.redraw();
    });
  });

  const box = el('div', { class: 'trip-detail' }, el('a', { class: 'back', href: '#/trips' }, '‹ 遠征予定の一覧'), form);
  if (!trip) return box;

  const past = isTripPast(trip, env.fixturesById, ctx.today);
  const links = el('div', { class: 'sec' },
    innerLink({ href: `#/result?${searchQuery(trip)}`, label: 'この条件で検索', sub: '乗換・高速バス・宿・飲食店など' }),
    past && trip.fixture_id ? innerLink({ href: `#/records/${encodeURIComponent(trip.fixture_id)}`, label: '観戦記録をつける' }) : null);
  box.append(links);
  if (!offline) {
    const del = el('button', { class: 'btn btn-sub btn-danger btn-small', type: 'button' }, 'この遠征予定を削除');
    del.addEventListener('click', () => {
      if (!window.confirm(CONFIRM_DELETE)) return;
      run(() => ctx.data.trips.remove(trip.id), del, async () => {
        state.clearForm(key);
        ctx.navigate('#/trips'); // 先に一覧へ（読み直しの間、削除した予定の「見つかりません」を見せない）
        await ctx.data.reloadPersonal();
      });
    });
    box.append(del);
  }
  return box;
}
