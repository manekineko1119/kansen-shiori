// 管理：シーズン（#/admin/seasons。設計書 3.4・11.4、FR-40）。一覧＋編集（所属クラブの大会の選択・現在のシーズンの切り替え）
// 選んでいるシーズンは ?id=、新規は ?new=1（D32）。今のシーズンの所属クラブは共通データ、ほかは ctx.data.seasonClubs（通信1回で覚える）
import { el, split } from '../../components/parts.js';
import { bindForm } from '../../mount.js';
import { readValues, createRunner } from '../../components/form-util.js';
import {
  selection, mastersGuard, canEdit, backLink, ctrl, field, listRow, setFlash, flashNote, dropFlashOnInput,
} from './common.js';
import { COMPETITIONS, seasonClubSections, currentCompetitions } from '../../../core/season-clubs.js';

// 所属クラブの行（undefined＝読み込み中、null＝読めない）
function clubRowsFor(ctx, id) {
  if (id === ctx.masters.data.season?.id) return ctx.masters.data.seasonClubs;
  return ctx.data.seasonClubs(id);
}

// 所属クラブ：クラブごとに「なし・J1・J2・J3」を選ぶ（設計書 3.4）。見出しは保存してある所属の大会ごと。
// 選び直しても行は動かさず（入力を残すため）、上の数だけ変える
function clubCompetitionList(ctx, rows, locked, form) {
  const clubs = ctx.masters.data.clubs;
  const current = currentCompetitions(rows);
  const count = el('p', { class: 'muted', 'data-count': '' });
  const update = () => {
    const f = form();
    const n = (comp) => clubs.filter((c) => (f?.elements[`comp_${c.id}`]?.value ?? '') === comp).length;
    count.textContent = [...COMPETITIONS.map((c) => `${c} ${n(c)}`), `所属なし ${n('')}`].join('・');
  };
  const select = (c) => {
    const sel = el('select', { name: `comp_${c.id}`, class: 'input', 'aria-label': `${c.name}の大会`, disabled: locked || null });
    for (const v of ['', ...COMPETITIONS]) sel.append(new Option(v || 'なし', v));
    sel.value = COMPETITIONS.includes(current.get(c.id)) ? current.get(c.id) : '';
    return sel;
  };
  const sections = seasonClubSections(clubs, rows).map((s) => el('div', { class: 'season-clubs' },
    el('h3', null, `${s.label}（${s.clubs.length}）`),
    s.clubs.map((c) => el('div', { class: 'season-club' }, el('span', null, c.name), select(c)))));
  return { node: el('div', null, count, sections), update };
}

function seasonForm(ctx, season) {
  const { state, key } = ctx;
  const isNew = !season;
  const editable = canEdit(ctx);
  const locked = !editable;
  const rows = isNew ? [] : clubRowsFor(ctx, season.id);
  const ready = Array.isArray(rows);
  const date = (label, name, value) => field(label, name, ctrl('input', name, value, { type: 'date', disabled: locked }), name);

  let form;
  const list = ready ? clubCompetitionList(ctx, rows, locked, () => form) : null;
  const rowsNote = rows === undefined ? '所属クラブを読み込み中です。'
    : rows === null ? '所属クラブを読み込めませんでした。通信できる場所で開き直してください。' : null;

  form = el('form', { class: 'sec admin-form', novalidate: true },
    backLink('#/admin/seasons', '‹ シーズンの一覧'),
    el('h2', null, isNew ? 'シーズンを追加' : `${season.id}${season.is_current ? '（現在のシーズン）' : ''}`),
    field('ID（2026-27 の形。あとから変えられません）', 'id', ctrl('input', 'id', isNew ? '' : season.id, { type: 'text', autocomplete: 'off', autocapitalize: 'none', readonly: isNew ? null : true, disabled: locked }), 'id'),
    el('div', { class: 'row2' },
      date('開始日', 'starts_on', isNew ? '' : season.starts_on),
      date('終了日', 'ends_on', isNew ? '' : season.ends_on)),
    el('h2', null, '所属クラブ'),
    list ? list.node : el('p', { class: 'muted', role: 'status' }, rowsNote),
    el('p', { class: 'err', 'data-err': '_form', role: 'alert' }),
    flashNote('seasons', isNew ? '' : season.id),
    editable ? el('button', { class: 'btn', type: 'submit', disabled: ready ? null : true }, isNew ? 'シーズンを追加' : '変更を保存') : el('p', { class: 'muted' }, 'オフラインのため、保存できません。'),
    !isNew && editable ? currentSection(season) : null);

  bindForm(form, state, key); // 開閉・回転で入力・チェックを残す
  list?.update();
  form.addEventListener('change', () => list?.update());
  dropFlashOnInput(form);
  const run = createRunner(ctx, form, 'admin-form');

  const afterSave = (id) => async () => {
    state.clearForm(key);
    setFlash('seasons', id);
    ctx.data.resetSeasons(); // シーズンの選択肢・所属クラブを読み直す
    await ctx.data.reloadMasters(); // 共通データを読み直す（描き直しも）
    if (isNew) ctx.navigate(`#/admin/seasons?id=${encodeURIComponent(id)}`);
  };

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (locked || !ready) return;
    const values = readValues(form);
    const next = { id: String(values.id ?? '').trim(), starts_on: String(values.starts_on ?? '').trim(), ends_on: String(values.ends_on ?? '').trim() };
    const want = Object.fromEntries(ctx.masters.data.clubs.map((c) => [c.id, String(values[`comp_${c.id}`] ?? '')]));
    const taken = isNew && (ctx.data.seasons() ?? []).some((s) => s.id === next.id);
    run(
      async () => (taken ? { ok: false, errors: { id: 'このIDはすでに登録されています' } } : ctx.data.admin.saveSeason(next, want)),
      form.querySelector('button[type="submit"]'),
      afterSave(next.id),
    );
  });

  const switchBtn = form.querySelector('[data-make-current]');
  switchBtn?.addEventListener('click', () => {
    if (!window.confirm(`${season.id} を現在のシーズンにします。日程・カレンダー・遠征予定の画面は、このシーズンの試合を出すようになります。よろしいですか？`)) return;
    run(() => ctx.data.admin.setCurrentSeason(season.id), switchBtn, afterSave(season.id));
  });
  return form;
}

// 現在のシーズンの切り替え（選んだシーズンだけが現在になる）
function currentSection(season) {
  if (season.is_current) return el('p', { class: 'muted' }, 'このシーズンが、日程・カレンダー・遠征予定で使われる現在のシーズンです。');
  return el('div', null,
    el('h2', null, '現在のシーズン'),
    el('p', { class: 'muted' }, '切り替えると、今の現在のシーズンは外れます（年に1回、開幕前に行います）。'),
    el('button', { class: 'btn btn-sub', type: 'button', 'data-make-current': '' }, 'このシーズンを現在のシーズンにする'));
}

export function renderSeasons(ctx) {
  const root = el('div', { class: 'admin' }, backLink('#/admin', '‹ 管理'));
  const guard = mastersGuard(ctx);
  if (guard) { root.append(guard); return root; }
  const sel = selection(ctx.route);
  const seasons = ctx.data.seasons(); // undefined＝読み込み中、null＝読めない
  const season = sel.id && Array.isArray(seasons) ? seasons.find((s) => s.id === sel.id) : null;

  let listBody;
  if (seasons === undefined) listBody = el('p', { class: 'muted' }, '読み込み中です。');
  else if (seasons === null) listBody = el('p', { class: 'note', role: 'status' }, 'シーズンの一覧を読み込めませんでした。通信できる場所で開き直してください。');
  else {
    listBody = seasons.map((s) => listRow({
      href: `#/admin/seasons?id=${encodeURIComponent(s.id)}`, label: s.id, sub: `${s.starts_on} 〜 ${s.ends_on}`,
      selected: s.id === sel.id, mark: s.is_current ? '現在' : null,
    }));
  }
  const list = el('section', { class: 'sec' },
    el('h2', null, 'シーズン'), listBody,
    canEdit(ctx) ? el('a', { class: 'btn btn-sub', href: '#/admin/seasons?new=1' }, 'シーズンを追加') : null);

  let detail = null;
  if (sel.isNew) detail = seasonForm(ctx, null);
  else if (sel.id && seasons === undefined) detail = el('section', { class: 'sec' }, el('p', { class: 'muted' }, '読み込み中です。'));
  else if (sel.id) {
    detail = season ? seasonForm(ctx, season)
      : el('section', { class: 'sec' }, backLink('#/admin/seasons', '‹ シーズンの一覧'), el('p', { class: 'muted' }, 'このシーズンは登録されていません。'));
  }
  root.append(split({ list, detail }));
  return root;
}
