// 管理：結果の未入力一覧（#/admin/unresulted。設計書 3.4、FR-46）
// 試合終了の目安を過ぎても scheduled のままの試合を、日付の古い順に。行 → その試合の観戦記録画面を「試合の情報を編集」の状態で開く
import { el } from '../../components/parts.js';
import { unresultedFixtures } from '../../../core/fixtures.js';
import { competitionLabel } from '../../../core/fixture-view.js';
import { mastersGuard, backLink, listRow, matchLabel } from './common.js';

export function renderUnresulted(ctx) {
  const root = el('div', { class: 'admin' }, backLink('#/admin', '‹ 管理'));
  const guard = mastersGuard(ctx);
  if (guard) { root.append(guard); return root; }
  const list = unresultedFixtures(ctx.masters.data.fixtures ?? [], ctx.nowMs);
  root.append(el('section', { class: 'sec' },
    el('h2', null, `結果の未入力一覧（${list.length}）`),
    list.length
      ? list.map((f) => listRow({
        href: `#/records/${encodeURIComponent(f.id)}?edit=fixture`,
        label: matchLabel(ctx, f),
        sub: `${f.kickoff ? f.kickoff.slice(0, 5) : 'キックオフ時刻未定'}　${competitionLabel(f)}`,
      }))
      : el('p', { class: 'muted' }, '結果が入っていない試合はありません。'),
    el('p', { class: 'hint' }, '今のシーズンの試合だけを出します。自動の取り込みで入らなかった試合は、行を開いてスコアと得点者を入れてください。')));
  return root;
}
