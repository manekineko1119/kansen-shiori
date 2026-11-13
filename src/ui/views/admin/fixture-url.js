// 管理：日程の「試合ページの URL で登録」（#/admin/fixtures?url=1。設計書 3.4）
// 試合ページの URL → Edge Function（import-match）で読む → planMatchImport でプレビュー → 登録／更新
import { el } from '../../components/parts.js';
import { bindForm } from '../../mount.js';
import { readValues, createRunner } from '../../components/form-util.js';
import { seasonForDate, planMatchImport } from '../../../core/match-import.js';
import { competitionLabel } from '../../../core/fixture-view.js';
import { jstDayStartIso } from '../../../core/sync-status.js';
import { formatDateJa } from '../../../core/format.js';
import { ACCESS_LIMITS } from '../../../../supabase/functions/_shared/sync-plan.js';
import { canEdit, backLink, ctrl, field, setFlash, reloadFixtures } from './common.js';

// 読み込んだ試合ページと今日の読んだ数（描き直しをまたいで覚える。DOM に持たせない）
let loaded = null; // { url, page }
let used; // undefined＝未取得、null＝読めなかった、数＝今日読んだ試合ページの数

// 管理のメニューに戻ったとき（index.js）に捨てる
export function forgetFixtureUrl() { loaded = null; used = undefined; }

const href = (seasonId, extra = '') => `#/admin/fixtures?s=${encodeURIComponent(seasonId)}${extra}`;
const scoreText = (s) => (s ? `${s[0]}-${s[1]}` : '');

function venueText(v) {
  if (v.kind === 'home') return v.label ? `${v.label}（ホームの会場）` : 'ホームの会場';
  if (v.kind === 'stadium') return `登録済みの会場：${v.label}`;
  if (v.kind === 'name') return `未登録の会場名：${v.label}`;
  return '未定';
}

function stateText(view) {
  if (view.state !== 'finished') return '試合前';
  if (!view.score) return '試合終了（スコアなし）';
  return `${scoreText(view.score)}${view.pk ? `（PK ${scoreText(view.pk)}）` : ''}`;
}

function previewBox(ctx, plan) {
  const v = plan.view;
  const name = (id) => ctx.masters.clubsById[id]?.short_name ?? id;
  return el('div', { 'data-preview': '' },
    el('h2', null, 'プレビュー'),
    el('dl', { class: 'kv sync-kv' },
      el('dt', null, '大会'), el('dd', null, competitionLabel({ competition: v.competition, round: v.round })),
      el('dt', null, '日時'), el('dd', null, `${formatDateJa(v.date)} ${v.kickoff ?? 'キックオフ未定'}`),
      el('dt', null, '対戦'), el('dd', null, `${name(v.homeClubId)} vs ${name(v.awayClubId)}`),
      el('dt', null, '会場'), el('dd', null, venueText(v.venue)),
      el('dt', null, '状態'), el('dd', null, stateText(v)),
      v.state === 'finished' && v.score ? el('dt', null, '得点者') : null,
      v.state === 'finished' && v.score ? el('dd', null, `${v.scorerCount}人`) : null,
      el('dt', null, '試合ID'), el('dd', null, plan.id)),
    plan.warnings.map((w) => el('p', { class: 'note', role: 'status' }, w)));
}

export function renderFixtureUrl(ctx, seasonId) {
  const { state, key } = ctx;
  const editable = canEdit(ctx);
  const admin = ctx.data.admin;
  if (used === undefined && editable) { // 今日あと何件読めるか：最初に1回だけ読む
    used = null;
    admin.loadMatchPagesToday(jstDayStartIso(ctx.nowMs)).then((res) => {
      if (res === 'expired') { ctx.onExpired(); return; }
      used = res?.ok ? res.used : null;
      ctx.redraw();
    });
  }
  const remaining = typeof used === 'number' ? Math.max(0, ACCESS_LIMITS.matchPagesPerDay - used) : null;

  const form = el('form', { class: 'sec admin-form', novalidate: true },
    backLink(href(seasonId), '‹ 日程の一覧'),
    el('h2', null, '試合ページの URL で登録'),
    el('p', { class: 'muted' }, 'ルヴァンカップの試合ページの URL を入れると、大会・回戦・日時・会場・対戦相手を読みます。試合のあとにもう一度入れると、結果・得点者・PK戦を更新します。'),
    field('試合ページの URL', 'match_url',
      ctrl('input', 'match_url', loaded?.url ?? '', { type: 'url', inputmode: 'url', autocapitalize: 'none', spellcheck: 'false', disabled: editable ? null : true }), 'match_url'),
    editable ? el('button', { class: 'btn btn-sub', type: 'submit' }, '読み込む') : el('p', { class: 'muted' }, 'オフラインのため、読み込めません。'),
    remaining === null ? null : el('p', { class: 'hint' }, `今日あと ${remaining} 件読めます`),
    el('p', { class: 'err', 'data-err': '_form', role: 'alert' }));
  bindForm(form, state, key);
  const run = createRunner(ctx, form, 'admin-form');
  // 書き換えたらプレビューを消す（画面は作り直さない。入力中のフォーカス・キーボードを保つ）
  form.addEventListener('input', () => { loaded = null; form.querySelector('[data-preview]')?.remove(); });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!editable) return;
    const url = readValues(form).match_url.trim();
    run(() => admin.readMatchPage(url), form.querySelector('button[type="submit"]'), async (res) => {
      loaded = { url: res.url ?? url, page: res.page };
      const day = await admin.loadMatchPagesToday(jstDayStartIso(ctx.nowMs)); // 読んだ分を数え直す
      if (day?.ok) used = day.used;
      ctx.redraw();
    });
  });
  if (!loaded) return form;

  const seasons = ctx.data.seasons();
  const season = seasonForDate(seasons ?? [], loaded.page.date);
  const fixtures = season ? ctx.data.seasonFixtures(season.id) : [];
  if (seasons === undefined || fixtures === undefined) { form.append(el('p', { class: 'muted' }, '読み込み中です。')); return form; }
  if (fixtures === null) { form.append(el('p', { class: 'note', role: 'status' }, '日程を読み込めませんでした。通信できる場所で開き直してください。')); return form; }
  const plan = planMatchImport(loaded.page, {
    url: loaded.url, season, clubs: ctx.masters.data.clubs, stadiums: ctx.masters.data.stadiums, existing: fixtures,
    supportClubId: ctx.settings?.support_club_id ?? null, nowIso: new Date(ctx.nowMs).toISOString(),
  });
  if (!plan.ok) {
    form.append(el('div', { 'data-preview': '' }, plan.errors.map((e) => el('p', { class: 'err', role: 'alert' }, e))));
    return form;
  }
  const go = el('button', { class: 'btn', type: 'button', disabled: editable ? null : true }, plan.mode === 'insert' ? '登録' : '更新');
  form.append(previewBox(ctx, plan), el('div', { class: 'actions' }, go));
  go.addEventListener('click', () => run(() => admin.saveMatchImport(plan), go, async () => {
    loaded = null;
    state.clearForm(key);
    setFlash('fixtures', plan.id);
    await reloadFixtures(ctx);
    ctx.navigate(href(season.id, `&id=${encodeURIComponent(plan.id)}`));
  }));
  return form;
}
