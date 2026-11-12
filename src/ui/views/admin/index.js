// 管理（#/admin/:section?。設計書 3.4）。section がなければ管理のメニュー、あれば項目の画面。管理者でなければルーターが止める（守りは RLS）
// 項目：クラブ・スタジアム・シーズン（6-10）、テスター・取り込み・未入力一覧・写真の使用量（6-12）、日程（6-11）
import { el, section, innerLink } from '../../components/parts.js';
import { renderClubs } from './clubs.js';
import { renderStadiums } from './stadiums.js';
import { renderSeasons } from './seasons.js';
import { renderFixtures } from './fixtures.js';
import { renderTesters } from './testers.js';
import { renderSync } from './sync.js';
import { renderUnresulted } from './unresulted.js';
import { renderPhotos } from './photos.js';

export const ADMIN_SECTIONS = [
  { id: 'clubs', label: 'クラブ', sub: '名前・別名・ホームスタジアム・試合動画の取得元', view: renderClubs },
  { id: 'stadiums', label: 'スタジアム', sub: '駅・近くの東横イン・空港・Agoda の地域', view: renderStadiums },
  { id: 'seasons', label: 'シーズン', sub: '所属クラブ・現在のシーズンの切り替え', view: renderSeasons },
  { id: 'fixtures', label: '日程', sub: '一覧・編集・貼り付けで取り込み', view: renderFixtures },
  { id: 'testers', label: 'テスター', sub: '招待するメールアドレス', view: renderTesters },
  { id: 'sync', label: '取り込み', sub: '試合結果・試合動画の自動取り込み', view: renderSync },
  { id: 'unresulted', label: '未入力一覧', sub: '結果がまだ入っていない試合', view: renderUnresulted },
  { id: 'photos', label: '写真の使用量', sub: 'Storage の使用量', view: renderPhotos },
];

function menu() {
  return section('管理', ADMIN_SECTIONS.map((s) => (s.view
    ? innerLink({ href: `#/admin/${s.id}`, label: s.label, sub: s.sub })
    : el('div', { class: 'row row-soon' },
      el('span', { class: 'row-main' }, el('span', { class: 'row-label' }, s.label), el('span', { class: 'row-sub muted' }, s.sub)),
      el('span', { class: 'row-mark' }, '準備中')))));
}

export function renderAdmin(ctx) {
  const found = ADMIN_SECTIONS.find((s) => s.id === ctx.route.params?.section);
  if (found?.view) return found.view(ctx);
  ctx.data.adminCache?.reset(); // メニューに戻ったら、次に開く項目は読み直す（テスター・取り込みの状況・写真の使用量）
  return menu();
}
