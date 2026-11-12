// 管理：日程（#/admin/fixtures。設計書 3.4・4.4・5.5、FR-42・43）。シーズンごとの一覧＋1件の編集・追加・削除＋貼り付けの取り込み
// URL（D32）：?s=<シーズン>（なければ今のシーズン）、?id=<試合ID>、?new=1、?import=1
import { el, split } from '../../components/parts.js';
import { bindForm } from '../../mount.js';
import { readValues, createRunner } from '../../components/form-util.js';
import { fixtureFromForm, fixtureToValues, importPlan } from '../../../core/fixture-form.js';
import { parseFixturesCsv } from '../../../core/import-csv.js';
import { pendingKickoffCount } from '../../../core/fixtures.js';
import { formatDateJa } from '../../../core/format.js';
import { jstNow } from '../../../core/time.js';
import {
  selection, mastersGuard, canEdit, backLink, ctrl, field, textField, listRow, setFlash, flashNote, dropFlashOnInput, matchLabel,
} from './common.js';

const STATUS_LABEL = { scheduled: '予定', postponed: '延期', cancelled: '中止', finished: '終了' };
const BLANK = { ...fixtureToValues({}), competition: 'J3', status: 'scheduled' };

// 取り込みのプレビューと結果（描き直しをまたいで覚える。DOM に持たせない）
// preview は解析したときの試合の配列（fixtures）も持ち、試合を読み直したら（保存・削除・取り込みのあと）古いものとして捨てる
let preview = null; // { seasonId, fixtures, plan }
let imported = null; // { seasonId, inserted, updated }：一覧に1回知らせる。一覧から離れたら消す

// 管理のメニューに戻ったとき（index.js）に、覚えたプレビュー・取り込みの知らせを捨てる
export function forgetFixtureImport() { preview = null; imported = null; }

const href = (seasonId, extra = '') => `#/admin/fixtures?s=${encodeURIComponent(seasonId)}${extra}`;
const byStart = (a, b) => (a.match_date + (a.kickoff ?? '')).localeCompare(b.match_date + (b.kickoff ?? ''));

// 保存・削除・取り込みのあと：覚えた試合を捨て、共通データ（今のシーズン）も読み直す
async function reloadFixtures(ctx) {
  ctx.data.resetSeasons();
  await ctx.data.reloadMasters();
}

function fixtureForm(ctx, seasonId, f) {
  const { state, key, masters } = ctx;
  const isNew = !f;
  const editable = canEdit(ctx);
  const locked = !editable;
  const v = isNew ? BLANK : fixtureToValues(f);
  const clubs = masters.data.clubs;
  const clubOptions = [['', '（選んでください）'], ...clubs.map((c) => [c.id, c.name])];
  const stadiumOptions = [['', 'ホームのスタジアム'], ...masters.data.stadiums.map((s) => [s.id, s.name])];
  const select = (label, name, options) => field(label, name, ctrl('select', name, v[name], { options, disabled: locked }), name);
  const finished = f?.status === 'finished';

  const form = el('form', { class: 'sec admin-form', novalidate: true },
    backLink(href(seasonId), '‹ 日程の一覧'),
    el('h2', null, isNew ? '試合を追加' : matchLabel(ctx, f)),
    isNew ? el('p', { class: 'muted' }, '試合IDは、シーズン・大会・節・ホーム・アウェイから作ります。あとから変えられません。')
      : el('p', { class: 'muted' }, `試合ID：${f.id}（変えられません。日付・節・クラブを直しても、観戦記録とのつながりはそのままです）`),
    el('div', { class: 'row2' },
      field('日付', 'match_date', ctrl('input', 'match_date', v.match_date, { type: 'date', disabled: locked }), 'match_date'),
      field('キックオフ（未定なら空）', 'kickoff', ctrl('input', 'kickoff', v.kickoff, { type: 'time', disabled: locked }), 'kickoff')),
    el('div', { class: 'row2' },
      textField('大会', 'competition', v.competition, locked, { autocapitalize: 'characters' }),
      textField('節（例：12。節がない試合は空）', 'round', v.round, locked, { inputmode: 'numeric' })),
    el('div', { class: 'row2' }, select('ホーム', 'home_club_id', clubOptions), select('アウェイ', 'away_club_id', clubOptions)),
    select('会場', 'venue_stadium_id', stadiumOptions),
    textField('会場の名前（未定・登録していない会場のときだけ）', 'venue_name_override', v.venue_name_override, locked),
    textField('Jリーグ公式の試合ページの URL（空なら自動の取り込みが入れます）', 'jleague_match_url', v.jleague_match_url, locked, { inputmode: 'url', autocapitalize: 'none' }),
    finished
      ? el('p', { class: 'muted' }, '試合は終わっています。結果・得点者は ', el('a', { href: `#/records/${encodeURIComponent(f.id)}?edit=fixture` }, '観戦記録の画面'), ' で直します。')
      : select('状態', 'status', [['scheduled', '予定'], ['postponed', '延期'], ['cancelled', '中止']]),
    el('p', { class: 'err', 'data-err': '_form', role: 'alert' }),
    flashNote('fixtures', isNew ? '' : f.id),
    editable
      ? el('div', { class: 'actions' },
        el('button', { class: 'btn', type: 'submit' }, isNew ? '試合を追加' : '変更を保存'),
        isNew ? null : el('button', { class: 'btn btn-sub btn-danger', type: 'button', 'data-delete': '' }, 'この試合を削除'))
      : el('p', { class: 'muted' }, 'オフラインのため、保存できません。'));

  bindForm(form, state, key);
  dropFlashOnInput(form);
  const run = createRunner(ctx, form, 'admin-form');
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (locked) return;
    const values = readValues(form);
    if (finished) delete values.status; // 終わった試合の状態は送らない（結果を残す）
    const next = fixtureFromForm({ ...values, id: isNew ? '' : f.id }, { seasonId });
    run(
      () => ctx.data.admin.saveFixture(next, { isNew, clubIds: new Set(clubs.map((c) => c.id)) }),
      form.querySelector('button[type="submit"]'),
      async () => {
        state.clearForm(key);
        setFlash('fixtures', next.id);
        await reloadFixtures(ctx);
        if (isNew) ctx.navigate(href(seasonId, `&id=${encodeURIComponent(next.id)}`));
      },
    );
  });
  const del = form.querySelector('[data-delete]');
  del?.addEventListener('click', () => {
    if (!window.confirm(`${matchLabel(ctx, f)} を削除します。元に戻せません。よろしいですか？`)) return;
    run(() => ctx.data.admin.deleteFixture(f.id), del, async () => {
      state.clearForm(key);
      await reloadFixtures(ctx);
      ctx.navigate(href(seasonId));
    });
  });
  return form;
}

function previewRow(ctx, row, kind) {
  const name = (id) => ctx.masters.clubsById[id]?.short_name ?? id;
  return el('div', { class: 'row' },
    el('span', { class: 'row-main' },
      el('span', { class: 'row-label' }, `${formatDateJa(row.match_date)} ${name(row.home_club_id)} vs ${name(row.away_club_id)}`),
      el('span', { class: 'row-sub muted' }, `${row.round ? `第${row.round}節　` : ''}${row.kickoff ?? 'キックオフ未定'}${row.venue_name_override ? `　${row.venue_name_override}` : ''}`)),
    el('span', { class: 'cur' }, kind));
}

function importPanel(ctx, season, fixtures) {
  const { state, key } = ctx;
  const editable = canEdit(ctx);
  const ready = Array.isArray(fixtures) && season;
  const mine = preview && preview.seasonId === season?.id && preview.fixtures === fixtures ? preview.plan : null;

  const form = el('form', { class: 'sec admin-form', novalidate: true },
    backLink(href(season?.id ?? ''), '‹ 日程の一覧'),
    el('h2', null, '貼り付けで取り込み'),
    el('p', { class: 'muted' }, '列：日付・キックオフ・大会・節・ホーム・アウェイ・会場（任意）・試合ページの URL（任意）。タブ区切りかカンマ区切り。同じ試合は日時・会場だけを上書きし、結果・得点者は消しません。'),
    field('貼り付ける表', 'paste', ctrl('textarea', 'paste', '', { rows: 8, disabled: !editable || null, spellcheck: 'false' }), 'paste'),
    editable ? el('button', { class: 'btn btn-sub', type: 'submit', disabled: ready ? null : true }, '解析する') : el('p', { class: 'muted' }, 'オフラインのため、取り込めません。'),
    el('p', { class: 'err', 'data-err': '_form', role: 'alert' }));
  bindForm(form, state, key);
  // 書き換えたら解析し直す。画面は作り直さず、プレビューだけ消す（入力中のフォーカス・キーボードを保つ）
  form.addEventListener('input', () => { if (preview) { preview = null; form.querySelector('[data-preview]')?.remove(); } });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!ready) return;
    const parsed = parseFixturesCsv(readValues(form).paste, { season, clubs: ctx.masters.data.clubs, stadiums: ctx.masters.data.stadiums });
    preview = { seasonId: season.id, fixtures, plan: importPlan(parsed, new Set(fixtures.map((x) => x.id))) };
    ctx.redraw();
  });
  if (!mine) return form;

  const hasErrors = mine.errors.length > 0;
  const total = mine.insert.length + mine.update.length;
  const go = el('button', { class: 'btn', type: 'button', disabled: total ? null : true }, hasErrors ? 'エラー行を除いて取り込む' : '取り込む');
  const cancel = el('button', { class: 'btn btn-sub', type: 'button' }, hasErrors ? 'すべて取り消す' : '取り消す');
  const box = el('div', { 'data-preview': '' },
    el('h2', null, 'プレビュー'),
    el('p', { role: 'status' }, `新規 ${mine.insert.length} 件・上書き ${mine.update.length} 件・エラー ${mine.errors.length} 件`),
    mine.errors.map((e) => el('p', { class: 'err' }, `${e.line} 行目：${e.reason}`)),
    el('div', { class: 'actions' }, go, cancel),
    mine.update.map((r) => previewRow(ctx, r, '上書き')),
    mine.insert.map((r) => previewRow(ctx, r, '新規')));
  form.append(box);
  const run = createRunner(ctx, form, 'admin-form');
  cancel.addEventListener('click', () => { preview = null; ctx.redraw(); });
  go.addEventListener('click', () => run(() => ctx.data.admin.importFixtures(mine, { skipErrors: hasErrors }), go, async (res) => {
    preview = null;
    imported = { seasonId: season.id, inserted: res.inserted, updated: res.updated };
    state.clearForm(key);
    await reloadFixtures(ctx);
    ctx.navigate(href(season.id));
  }));
  return form;
}

function seasonPicker(ctx, seasonId) {
  const seasons = ctx.data.seasons() ?? [];
  const ids = seasons.some((s) => s.id === seasonId) ? seasons.map((s) => s.id) : [seasonId, ...seasons.map((s) => s.id)];
  const node = ctrl('select', 'season', seasonId, { options: ids.map((id) => [id, id]), 'aria-label': 'シーズン' });
  node.addEventListener('change', () => ctx.navigate(href(node.value)));
  return node;
}

export function renderFixtures(ctx) {
  const root = el('div', { class: 'admin' }, backLink('#/admin', '‹ 管理'));
  const guard = mastersGuard(ctx);
  if (guard) { root.append(guard); return root; }
  const q = new URLSearchParams(ctx.route.query ?? '');
  const seasonId = q.get('s') || ctx.masters.data.season?.id || '';
  if (seasonId === '') { root.append(el('p', { class: 'muted' }, '今のシーズンがありません。先にシーズンを登録してください。')); return root; }
  const sel = selection(ctx.route);
  const fixtures = ctx.data.seasonFixtures(seasonId); // undefined＝読み込み中、null＝読めない
  const season = (ctx.data.seasons() ?? []).find((s) => s.id === seasonId)
    ?? (ctx.masters.data.season?.id === seasonId ? ctx.masters.data.season : null);
  const list = Array.isArray(fixtures) ? [...fixtures].sort(byStart) : [];
  const pending = Array.isArray(fixtures) ? pendingKickoffCount(fixtures, jstNow(ctx.nowMs).date) : 0;
  const done = imported?.seasonId === seasonId ? imported : null;

  let body;
  if (fixtures === undefined) body = el('p', { class: 'muted' }, '読み込み中です。');
  else if (fixtures === null) body = el('p', { class: 'note', role: 'status' }, '日程を読み込めませんでした。通信できる場所で開き直してください。');
  else if (list.length === 0) body = el('p', { class: 'muted' }, 'このシーズンの試合はまだありません。「貼り付けで取り込み」で入れてください。');
  else {
    body = list.map((f) => listRow({
      href: href(seasonId, `&id=${encodeURIComponent(f.id)}`), label: matchLabel(ctx, f),
      sub: `${f.round ? `第${f.round}節　` : ''}${f.kickoff ?? 'キックオフ未定'}`,
      selected: f.id === sel.id, mark: f.status === 'scheduled' ? null : STATUS_LABEL[f.status],
    }));
  }
  const listSec = el('section', { class: 'sec' },
    el('h2', null, `日程（${list.length}）`),
    seasonPicker(ctx, seasonId),
    done ? el('p', { class: 'note', role: 'status' }, `取り込みました（新規 ${done.inserted} 件・上書き ${done.updated} 件）`) : null,
    pending ? el('p', { class: 'note', role: 'status' }, `キックオフ時刻が未定の試合：${pending} 件（これからの試合）。日程が発表されたら、表を作り直して取り込み直してください。`) : null,
    canEdit(ctx) ? el('div', { class: 'actions' },
      el('a', { class: 'btn btn-sub', href: href(seasonId, '&import=1') }, '貼り付けで取り込み'),
      el('a', { class: 'btn btn-sub', href: href(seasonId, '&new=1') }, '試合を追加')) : null,
    body);

  if (q.get('import') === '1' || sel.isNew || sel.id) imported = null; // 一覧から離れたら、取り込みの知らせは消す
  let detail = null;
  if (q.get('import') === '1') detail = importPanel(ctx, season, fixtures);
  else if (sel.isNew) detail = fixtureForm(ctx, seasonId, null);
  else if (sel.id && fixtures === undefined) detail = el('section', { class: 'sec' }, el('p', { class: 'muted' }, '読み込み中です。'));
  else if (sel.id) {
    const f = list.find((x) => x.id === sel.id);
    detail = f ? fixtureForm(ctx, seasonId, f)
      : el('section', { class: 'sec' }, backLink(href(seasonId), '‹ 日程の一覧'), el('p', { class: 'muted' }, 'この試合は登録されていません。'));
  }
  root.append(split({ list: listSec, detail }));
  return root;
}
