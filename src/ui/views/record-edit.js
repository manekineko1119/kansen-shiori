// 自分の観戦記録の入力（観戦方法・費用・感想メモ）。設計書 3.4.1・4.2、FR-50〜55
// 保存・削除は ctx.data.records、保存のあとの読み直しは ctx.data.reloadPersonal()（D33）。写真は 6-7 で足す
import { el } from '../components/parts.js';
import { bindForm } from '../mount.js';
import { readValues, createRunner } from '../components/form-util.js';
import { formatYen } from '../../core/format.js';
import { recordFromForm, recordFormValues, costTotal, COST_KEYS, COST_LABELS, WATCH_LABELS } from '../../core/record-form.js';

const CONFIRM_DELETE = 'この観戦記録を削除しますか';

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
  const total = el('span', { class: 'fig', 'data-total': '' });

  const styles = Object.entries(WATCH_LABELS).map(([v, label]) => el('label', { class: 'chip' },
    el('input', { type: 'radio', name: 'watch_style', value: v, checked: initial.watch_style === v }), el('span', null, label)));
  const costs = COST_KEYS.map((k) => field(`${COST_LABELS[k]}（円）`, k,
    el('input', { id: `r-${k}`, name: k, class: 'input', type: 'text', inputmode: 'numeric', autocomplete: 'off', value: initial[k] })));
  const memo = el('textarea', { id: 'r-memo', name: 'memo', class: 'input', rows: '5' });
  memo.value = initial.memo;

  const form = el('form', { class: 'sec record-form', novalidate: true },
    el('h2', null, record ? '記録を編集' : '観戦記録を追加'),
    el('fieldset', { class: 'field grp' }, el('legend', null, '観戦方法'), el('div', { class: 'seg' }, styles), el('p', { class: 'err', 'data-err': 'watch_style' })),
    el('h2', null, '費用'),
    costs,
    el('div', { class: 'costs num' }, el('span', null, '合計'), total),
    field('感想メモ', 'memo', memo),
    el('p', { class: 'muted' }, '公開設定：非公開（観戦記録は自分だけが見られます）'),
    el('p', { class: 'err', 'data-err': '_form', role: 'alert' }),
    el('div', { class: 'actions' },
      el('button', { class: 'btn', type: 'submit' }, '保存'),
      el('a', { class: 'btn btn-sub', href: doneHref }, 'キャンセル')));

  bindForm(form, ctx.state, formKey); // 開閉・回転で入力を残す（段6 の約束）
  // 費用の合計は入力のたびに出し直す。数字でない欄は 0 として合計しない
  const showTotal = () => { total.textContent = formatYen(costTotal(recordFromForm(readValues(form)))); };
  form.addEventListener('input', showTotal);
  showTotal();

  const run = createRunner(ctx, form, 'record-form');
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const next = { ...recordFromForm(readValues(form)), fixture_id: fixture.id, trip_id: trip?.id ?? null };
    run(() => ctx.data.records.save(next), form.querySelector('button[type="submit"]'), async () => {
      ctx.state.clearForm(formKey);
      await ctx.data.reloadPersonal();
      ctx.navigate(doneHref);
    });
  });

  const box = el('div', { class: 'record-edit' }, form);
  if (record) {
    const del = el('button', { class: 'btn btn-sub btn-danger btn-small', type: 'button' }, 'この観戦記録を削除');
    del.addEventListener('click', () => {
      if (!window.confirm(CONFIRM_DELETE)) return;
      run(() => ctx.data.records.remove(record.id), del, async () => {
        ctx.state.clearForm(formKey);
        await ctx.data.reloadPersonal();
        ctx.navigate(doneHref);
      });
    });
    box.append(del);
  }
  return box;
}
