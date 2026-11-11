// 管理：スタジアム（#/admin/stadiums。設計書 3.4、FR-41・44）。一覧＋編集。選んでいるスタジアムは ?id=、新規は ?new=1（D32）
import { el, split } from '../../components/parts.js';
import { selection, mastersGuard, canEdit, backLink, listRow } from './common.js';
import { stadiumForm } from './stadium-form.js';

export function renderStadiums(ctx) {
  const root = el('div', { class: 'admin' }, backLink('#/admin', '‹ 管理'));
  const guard = mastersGuard(ctx);
  if (guard) { root.append(guard); return root; }
  const sel = selection(ctx.route);
  const stadiums = ctx.masters.data.stadiums;
  const stadium = sel.id ? stadiums.find((s) => s.id === sel.id) : null;

  const list = el('section', { class: 'sec' },
    el('h2', null, `スタジアム（${stadiums.length}）`),
    stadiums.map((s) => listRow({
      href: `#/admin/stadiums?id=${encodeURIComponent(s.id)}`, label: s.name,
      sub: `${s.prefecture}　確認 ${s.verified_at ?? '未'}`, selected: s.id === sel.id,
    })),
    canEdit(ctx) ? el('a', { class: 'btn btn-sub', href: '#/admin/stadiums?new=1' }, 'スタジアムを追加') : null);

  let detail = null;
  if (sel.isNew) detail = stadiumForm(ctx, null);
  else if (sel.id) {
    detail = stadium ? stadiumForm(ctx, stadium)
      : el('section', { class: 'sec' }, backLink('#/admin/stadiums', '‹ スタジアムの一覧'), el('p', { class: 'muted' }, 'このスタジアムは登録されていません。'));
  }
  root.append(split({ list, detail }));
  return root;
}
