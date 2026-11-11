// 自分の観戦記録の入力（観戦方法・費用・感想メモ）。設計書 3.4.1・4.2、FR-50〜55
// 保存・削除は ctx.data.records、保存のあとの読み直しは ctx.data.reloadPersonal()（D33）。写真は record-photo.js（9章：写真だけ失敗しても記録は保存する）
import { el } from '../components/parts.js';
import { bindForm } from '../mount.js';
import { readValues, createRunner } from '../components/form-util.js';
import { renderPhotoField } from './record-photo.js';
import { formatYen } from '../../core/format.js';
import { recordFromForm, recordFormValues, costTotal, COST_KEYS, COST_LABELS, WATCH_LABELS } from '../../core/record-form.js';

const CONFIRM_DELETE = 'この観戦記録を削除しますか';
const CONFIRM_REMOVE_PHOTO = 'この写真を削除しますか';

const field = (label, name, node) => el('div', { class: 'field' }, el('label', { for: `r-${name}` }, label), node, el('p', { class: 'err', 'data-err': name }));

/**
 * @param opts.fixture 試合
 * @param opts.record 保存済みの自分の記録（なければ null）
 * @param opts.trip この試合の自分の遠征予定（なければ null）
 * @param opts.formKey 入力中の値を持つキー（試合の情報の編集とは別）
 * @param opts.doneHref 保存・削除のあと、キャンセルで戻る画面
 */
export function renderRecordForm(ctx, { fixture, record, trip, formKey, doneHref }) {
  const initial = recordFormValues(record);
  let savedWithoutPhoto = false; // 記録は保存したが、写真だけ失敗している
  const total = el('span', { class: 'fig', 'data-total': '' });

  const styles = Object.entries(WATCH_LABELS).map(([v, label]) => el('label', { class: 'chip' },
    el('input', { type: 'radio', name: 'watch_style', value: v, checked: initial.watch_style === v }), el('span', null, label)));
  const costs = COST_KEYS.map((k) => field(`${COST_LABELS[k]}（円）`, k,
    el('input', { id: `r-${k}`, name: k, class: 'input', type: 'text', inputmode: 'numeric', autocomplete: 'off', value: initial[k] })));
  const memo = el('textarea', { id: 'r-memo', name: 'memo', class: 'input', rows: '5' });
  memo.value = initial.memo;

  // 保存・削除のあと：入力中の値を捨て、個人データを読み直して戻る
  const finish = async () => {
    ctx.state.clearForm(formKey);
    await ctx.data.reloadPersonal();
    ctx.navigate(doneHref);
  };
  let run = null; // フォームを作ったあとに入れる（photo の onRemove から使う）
  // 写真を外すのは保存済みの記録の写真（入力中の値は使わない）
  const photo = renderPhotoField(ctx, {
    record,
    onRemove: () => {
      if (!window.confirm(CONFIRM_REMOVE_PHOTO)) return;
      run(() => ctx.data.records.removePhoto(record), photo.removeButton, async () => { await ctx.data.reloadPersonal(); });
    },
  });

  const form = el('form', { class: 'sec record-form', novalidate: true },
    el('h2', null, record ? '記録を編集' : '観戦記録を追加'),
    el('fieldset', { class: 'field grp' }, el('legend', null, '観戦方法'), el('div', { class: 'seg' }, styles), el('p', { class: 'err', 'data-err': 'watch_style' })),
    el('h2', null, '費用'),
    costs,
    el('div', { class: 'costs num' }, el('span', null, '合計'), total),
    field('感想メモ', 'memo', memo),
    photo?.node,
    el('p', { class: 'muted' }, '公開設定：非公開（観戦記録は自分だけが見られます）'),
    el('p', { class: 'err', 'data-err': '_form', role: 'alert' }),
    el('div', { class: 'actions' },
      el('button', { class: 'btn', type: 'submit' }, '保存'),
      el('a', { class: 'btn btn-sub', href: doneHref, onclick: () => { if (savedWithoutPhoto) ctx.data.reloadPersonal(); } }, 'キャンセル')));

  bindForm(form, ctx.state, formKey); // 開閉・回転で入力を残す（段6 の約束）
  // 費用の合計は入力のたびに出し直す。数字でない欄は 0 として合計しない
  const showTotal = () => { total.textContent = formatYen(costTotal(recordFromForm(readValues(form)))); };
  form.addEventListener('input', showTotal);
  showTotal();

  run = createRunner(ctx, form, 'record-form');
  const nextRecord = () => ({ ...recordFromForm(readValues(form)), fixture_id: fixture.id, trip_id: trip?.id ?? null });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    run(() => ctx.data.records.saveWithPhoto(nextRecord(), photo?.makeBlob ?? null), form.querySelector('button[type="submit"]'), async (res) => {
      if (!res.photoError) { await finish(); return; }
      // 記録は保存済み。写真だけ「もう一度アップロード」を出し、画面は閉じない（描き直さないので、選んだ写真も残る）
      savedWithoutPhoto = true;
      photo.fail(res.photoError, () => run(() => ctx.data.records.attachPhoto(nextRecord(), photo.makeBlob), photo.retryButton, finish));
    });
  });

  const box = el('div', { class: 'record-edit' }, form);
  if (record) {
    const del = el('button', { class: 'btn btn-sub btn-danger btn-small', type: 'button' }, 'この観戦記録を削除');
    del.addEventListener('click', () => {
      if (!window.confirm(CONFIRM_DELETE)) return;
      run(() => ctx.data.records.remove(record.id, record.photo_path ?? null), del, finish);
    });
    box.append(del);
  }
  return box;
}
