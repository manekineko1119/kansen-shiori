// 管理：取り込み（#/admin/sync。設計書 3.4・6.2・9章、FR-52、D37）
// 試合結果の最後の取り込み・今季の取り込めた数・得点者の取り込みに失敗した試合・今日の残り・「今すぐ取り込む」と、試合動画の最終登録
import { el } from '../../components/parts.js';
import { syncPanel, pressSkipsEvening, importCounts, jstDayStartIso } from '../../../core/sync-status.js';
import { ACCESS_LIMITS } from '../../../../supabase/functions/_shared/sync-plan.js';
import { mastersGuard, canEdit, backLink, loadGuard, matchLabel, dateTimeText } from './common.js';

const D37_CONFIRM = '今日 23:30 の定期の取り込みは一覧を読まなくなります（1日2回までのため）。取り込みますか？';
const SKIPPED = { limit: '上限のため読まず', running: '実行中のため読まず' };
const STATE = { ok: '成功', failed: '失敗', running: '実行中', aborted: '中断' };

const stateText = (last) => (last.state === 'skipped' ? SKIPPED[last.skippedReason] ?? '読まず' : STATE[last.state]);

// 最後の結果の行（成功・失敗（赤）・中断（赤）・読まず（灰色）・実行中）
function lastBlock(last) {
  if (!last) return el('p', { class: 'muted' }, 'まだ一度も動いていません。');
  return el('div', { class: 'sync-last' },
    el('p', null, el('span', { class: `sync-state sync-${last.state}` }, stateText(last)), ` ${dateTimeText(last.ranAt)}`),
    last.message ? el('p', { class: 'sync-msg muted' }, last.message) : null);
}

// 「今すぐ取り込む」の結果（押したあと、次に押すまで出す）
function outcomeNote(outcome) {
  if (!outcome || typeof outcome !== 'object') return null; // 期限切れなどは覚えない（念のため、描画で落とさない）
  if (!outcome.ok) return el('p', { class: 'err', role: 'alert' }, outcome.errors._form);
  const r = outcome.result;
  const head = r.skippedReason ? SKIPPED[r.skippedReason] ?? '読みませんでした' : r.ok ? '取り込みました' : '取り込みに失敗しました';
  return el('p', { class: r.ok || r.skippedReason ? 'note' : 'err', role: 'status' }, r.message ? `${head}：${r.message}` : head);
}

function runButton(ctx, runs, panel) {
  const cache = ctx.data.adminCache;
  const running = cache.run().running;
  const btn = el('button', { class: 'btn', type: 'button', disabled: running || !panel.canRun || null }, running ? '取り込み中…' : '今すぐ取り込む');
  btn.addEventListener('click', async () => {
    if (cache.run().running || !syncPanel(runs, Date.now()).canRun) return;
    if (pressSkipsEvening(runs, Date.now()) && !window.confirm(D37_CONFIRM)) return;
    btn.disabled = true; // 結果が返るまで押せない（作り直しても cache.run().running で押せない）
    const res = await cache.runNow(ctx.settings?.support_club_id ?? null);
    if (res === 'expired') { ctx.onExpired(); return; }
    if (res?.ok) await ctx.data.reloadMasters(); // 取り込んだ結果を画面に出す（描き直しも）
  });
  return btn;
}

function resultsSection(ctx, status) {
  const runs = status.runs;
  const panel = syncPanel(runs, ctx.nowMs);
  const fixtures = ctx.masters.data?.fixtures ?? [];
  const counts = importCounts(fixtures, ctx.nowMs);
  const editable = canEdit(ctx);
  return el('section', { class: 'sec' },
    el('h2', null, '試合結果の取り込み'),
    lastBlock(panel.last),
    el('dl', { class: 'kv sync-kv' },
      el('dt', null, '今季'), el('dd', null, `自動で取り込めた ${counts.api}試合　手入力 ${counts.manual}試合　未入力 ${counts.missing}試合`),
      el('dt', null, '今日の残り'), el('dd', null, `一覧 ${panel.remaining.list}/${ACCESS_LIMITS.listPerDay}回　試合ページ ${panel.remaining.pages}/${ACCESS_LIMITS.matchPagesPerDay}件`)),
    counts.missing ? el('a', { class: 'row', href: '#/admin/unresulted' },
      el('span', { class: 'row-main' }, el('span', { class: 'row-label' }, '結果の未入力一覧')), el('span', { class: 'row-mark', 'aria-hidden': 'true' }, '›')) : null,
    editable ? runButton(ctx, runs, panel) : el('p', { class: 'muted' }, 'オフラインのため、取り込みは実行できません。'),
    editable && panel.reason ? el('p', { class: 'muted' }, panel.reason) : null,
    editable ? outcomeNote(ctx.data.adminCache.run().outcome) : null,
    el('p', { class: 'hint' }, '1日に一覧2回・試合ページ10件までです（定期の取り込み 7:00・23:30 を含みます）。'));
}

// 得点者の取り込みに失敗した試合（scorers_failed_at あり）。空に戻すと、次の取り込みでもう一度試合ページを読む
let scorerError = null;
function scorersSection(ctx) {
  const failed = (ctx.masters.data?.fixtures ?? []).filter((f) => f.scorers_failed_at);
  if (!failed.length) return null;
  const editable = canEdit(ctx);
  const rows = failed.map((f) => {
    const btn = editable ? el('button', { class: 'btn btn-sub btn-small', type: 'button' }, '空に戻す') : null;
    btn?.addEventListener('click', async () => {
      btn.disabled = true;
      const res = await ctx.data.admin.clearScorersFailed(f.id);
      btn.disabled = false;
      if (res === 'expired') { ctx.onExpired(); return; }
      scorerError = res.ok ? null : res.errors._form;
      if (res.ok) await ctx.data.reloadMasters(); else ctx.redraw();
    });
    return el('div', { class: 'row' },
      el('a', { class: 'row-main', href: `#/records/${encodeURIComponent(f.id)}?edit=fixture` },
        el('span', { class: 'row-label' }, matchLabel(ctx, f)),
        el('span', { class: 'row-sub muted' }, `得点者の取り込みに失敗 ${dateTimeText(f.scorers_failed_at)}`)),
      btn);
  });
  return el('section', { class: 'sec' },
    el('h2', null, `得点者の取り込みに失敗した試合（${failed.length}）`),
    el('p', { class: 'note' }, '得点者を手で入れるか、「空に戻す」を押すと次の取り込みでもう一度読みます。'),
    rows,
    scorerError ? el('p', { class: 'err', role: 'alert' }, scorerError) : null);
}

// 試合動画の最終登録（成功・失敗・中断の見分け方は試合結果と同じ）
function videosSection(ctx, video) {
  return el('section', { class: 'sec' },
    el('h2', null, '試合動画の自動登録'),
    lastBlock(video ? syncPanel([video], ctx.nowMs).last : null));
}

export function renderSync(ctx) {
  const root = el('div', { class: 'admin' }, backLink('#/admin', '‹ 管理'));
  const masters = mastersGuard(ctx); // 今季の試合の数・得点者の失敗は共通データから数える
  if (masters) { root.append(masters); return root; }
  const status = ctx.data.adminCache.syncStatus(jstDayStartIso(ctx.nowMs));
  const guard = loadGuard(ctx, status);
  if (guard) { root.append(el('section', { class: 'sec' }, el('h2', null, '試合結果の取り込み'), guard)); return root; }
  root.append(resultsSection(ctx, status), scorersSection(ctx), videosSection(ctx, status.videoLast));
  return root;
}
