// 管理：写真の使用量（#/admin/photos。設計書 3.4・9章、D36）。admin_photo_usage() の合計を MB で出し、1GB の 80% 以上で注意
import { el } from '../../components/parts.js';
import { photoUsageLevel, PHOTO_LIMIT_BYTES } from '../../../core/sync-status.js';
import { backLink, loadGuard } from './common.js';

const MB = 2 ** 20;

export function renderPhotos(ctx) {
  const root = el('div', { class: 'admin' }, backLink('#/admin', '‹ 管理'));
  const res = ctx.data.adminCache.photoUsage();
  const guard = loadGuard(ctx, res);
  const sec = el('section', { class: 'sec' }, el('h2', null, '写真の使用量'));
  root.append(sec);
  if (guard) { sec.append(guard); return root; }
  const ratio = Math.min(1, res.bytes / PHOTO_LIMIT_BYTES);
  const warn = photoUsageLevel(res.bytes) === 'warn';
  // 素の append は null を文字の "null" にするので、捨てる
  sec.append(...[
    el('p', { class: 'usage-num' }, el('b', null, `${(res.bytes / MB).toFixed(1)} MB`), ` / ${PHOTO_LIMIT_BYTES / MB} MB（${Math.floor(ratio * 100)}%）`),
    el('div', { class: `usage-bar${warn ? ' usage-warn' : ''}`, role: 'img', 'aria-label': `使用量 ${Math.floor(ratio * 100)}%` },
      el('span', { style: `width: ${(ratio * 100).toFixed(1)}%` })),
    warn ? el('p', { class: 'note', role: 'status' }, '無料の 1GB の 80% を超えています。上限に達すると写真を保存できなくなります。') : null,
    el('p', { class: 'hint' }, '観戦記録の写真（全員の分）の合計です。Supabase の無料プランの Storage は 1GB までです。'),
  ].filter(Boolean));
  return root;
}
