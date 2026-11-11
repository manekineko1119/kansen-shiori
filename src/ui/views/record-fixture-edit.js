// 試合の情報の編集（管理者だけ。守りは RLS）。状態・スコア・得点者・動画の URL。設計書 3.4.1、FR-52・52b
// 保存すると result_source が 'manual' になる。保存は ctx.data.records、保存のあとの読み直しは ctx.data.reloadMasters()
import { el } from '../components/parts.js';
import { bindForm } from '../mount.js';
import { readValues, createRunner } from '../components/form-util.js';
import {
  fixtureEditFromForm, fixtureFormValues, removeScorerRow, scorerRowIndexes, scorerRows, addScorerRow,
  STATUS_OPTIONS, SCORER_TYPES, VIDEO_KINDS,
} from '../../core/record-form.js';

const clubName = (id, clubsById) => clubsById?.[id]?.name ?? id ?? '未定';
const field = (label, name, node, err = name) => el('div', { class: 'field' }, el('label', { for: `f-${name}` }, label), node, el('p', { class: 'err', 'data-err': err }));
const select = (name, options, value, label) => {
  const s = el('select', { id: `f-${name}`, name, class: 'input', 'aria-label': label });
  for (const [v, text] of options) s.append(new Option(text, v));
  s.value = value;
  return s;
};

/**
 * @param opts.fixture 試合（fixture_videos を含む）
 * @param opts.formKey 入力中の値を持つキー（自分の記録の編集とは別）
 * @param opts.doneHref 保存・キャンセルのあとに戻る画面
 * @param opts.onSaved 保存に成功したあとの読み直し（async）
 */
export function renderFixtureEdit(ctx, { fixture, formKey, doneHref, clubsById, onSaved }) {
  const initial = fixtureFormValues(fixture);
  const scorers = scorerRows(initial, ctx.state.getForm(formKey));
  const homeName = clubName(fixture.home_club_id, clubsById);
  const awayName = clubName(fixture.away_club_id, clubsById);
  const sides = [['home', `${homeName}（ホーム）`], ['away', `${awayName}（アウェイ）`]];

  const rowsState = () => ({ ...ctx.state.getForm(formKey), ...readValues(form) });
  const rows = [];
  for (let i = 0; i < scorers.length; i++) {
    const v = (k) => scorers[i][k];
    const del = el('button', { class: 'btn btn-sub btn-danger btn-small', type: 'button', 'aria-label': `得点者${i + 1}行目を削除` }, '削除');
    del.addEventListener('click', () => { ctx.state.setForm(formKey, removeScorerRow(rowsState(), i)); ctx.redraw(); });
    rows.push(el('fieldset', { class: 'scorer-row' },
      el('legend', null, `得点者 ${i + 1}`),
      el('div', { class: 'row2' },
        select(`scorer_${i}_side`, sides, v('side'), '得点したチーム'),
        select(`scorer_${i}_type`, Object.entries(SCORER_TYPES), v('type'), '種類')),
      el('div', { class: 'row2' },
        el('input', { name: `scorer_${i}_player`, class: 'input', type: 'text', autocomplete: 'off', placeholder: '選手名', 'aria-label': '選手名', value: v('player') }),
        el('input', { name: `scorer_${i}_minute`, class: 'input', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '時間（64 や 45+1）', 'aria-label': '時間', value: v('minute') })),
      el('p', { class: 'err', 'data-err': `scorer_${i}_side` }), el('p', { class: 'err', 'data-err': `scorer_${i}_minute` }), el('p', { class: 'err', 'data-err': `scorer_${i}_type` }),
      del));
  }
  const add = el('button', { class: 'btn btn-sub btn-small', type: 'button' }, '得点者を追加');
  add.addEventListener('click', () => {
    ctx.state.setForm(formKey, addScorerRow(rowsState()));
    ctx.redraw();
  });

  const score = (name, label, value) => field(label, name, el('input', { id: `f-${name}`, name, class: 'input', type: 'text', inputmode: 'numeric', autocomplete: 'off', value }));
  const video = (kind, label) => field(`${label}の動画の URL`, `video_${kind}`, el('input', { id: `f-video_${kind}`, name: `video_${kind}`, class: 'input', type: 'text', inputmode: 'url', autocomplete: 'off', placeholder: 'https://www.youtube.com/watch?v=', value: initial[`video_${kind}`] }));

  const form = el('form', { class: 'sec fixture-edit', novalidate: true },
    el('h2', null, '試合の情報を編集'),
    el('p', { class: 'note' }, '保存すると、この試合は「手入力」になり、Jリーグ公式からの自動の取り込みでは上書きされなくなります。'),
    field('状態', 'status', select('status', Object.entries(STATUS_OPTIONS), initial.status, '状態')),
    el('div', { class: 'row2' }, score('home_score', `${homeName}のスコア`, initial.home_score), score('away_score', `${awayName}のスコア`, initial.away_score)),
    el('h2', null, '得点者'),
    rows,
    el('input', { type: 'hidden', name: 'scorer_count', value: String(scorers.length) }),
    add,
    el('h2', null, '試合動画'),
    el('p', { class: 'muted' }, '空にすると、手入力の動画だけを消します（自動で登録された動画は残ります）。'),
    Object.entries(VIDEO_KINDS).map(([k, label]) => video(k, label)),
    el('p', { class: 'err', 'data-err': '_form', role: 'alert' }),
    el('div', { class: 'actions' },
      el('button', { class: 'btn', type: 'submit' }, '保存'),
      el('a', { class: 'btn btn-sub', href: doneHref }, 'キャンセル')));

  bindForm(form, ctx.state, formKey); // 開閉・回転で入力を残す（行の数も scorer_count で残る）

  const run = createRunner(ctx, form, 'fixture-edit');
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const values = readValues(form);
    const edit = fixtureEditFromForm(values);
    const kept = scorerRowIndexes(values); // 検証の番号は、空の行を捨てたあとの番号。画面の行に戻す
    const toRow = (errors) => Object.fromEntries(Object.entries(errors).map(([k, msg]) => {
      const m = /^scorers\.(\d+)\.(\w+)$/.exec(k);
      return [m ? `scorer_${kept[Number(m[1])]}_${m[2]}` : k, msg];
    }));
    // 動画だけ失敗したとき（partial）は、試合の更新が入っているので共通データを読み直す。入力は消さず、理由を出す
    const save = async () => {
      const res = await ctx.data.records.saveFixtureInfo(fixture.id, edit, { homeClubId: fixture.home_club_id, awayClubId: fixture.away_club_id });
      if (res?.partial) await onSaved();
      return res;
    };
    run(save,
      form.querySelector('button[type="submit"]'),
      async () => {
        ctx.state.clearForm(formKey);
        await onSaved();
        ctx.navigate(doneHref);
      }, toRow);
  });
  return form;
}
