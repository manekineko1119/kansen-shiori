// 段6 までの仮の画面。5-3 の確認用に、入力欄と長い本文を置く
import { bindForm } from '../mount.js';

export const TITLES = {
  search: 'スタジアム検索', result: '検索結果', fixtures: '日程', calendar: 'カレンダー',
  trips: '遠征予定', trip: '遠征予定の詳細', records: '観戦記録', record: '観戦記録の詳細',
  settings: '設定', login: 'ログイン', welcome: 'ようこそ', admin: '管理',
};

// 共通データの状態の表示（確認用。段6 で本物の画面に置き換える）
export function mastersText(masters) {
  if (!masters) return '共通データ：読み込み中';
  if (masters.status === 'unavailable') return masters.message;
  const label = { offline: masters.label, cached: '更新中' }[masters.status] ?? '最新';
  return `クラブ ${masters.data.clubs.length}件（${label}）`;
}

export function renderPlaceholder(route, state, key, masters = null) {
  const el = document.createElement('div');
  if (route.forbidden) {
    el.innerHTML = '<section class="sec"><h2>権限がありません</h2><p class="muted">この画面を開く権限がありません。</p></section>';
    return el;
  }
  const label = TITLES[route.name] ?? route.name;
  el.className = 'two-col';
  const a = document.createElement('section');
  a.className = 'sec';
  a.innerHTML = `<h2></h2><p class="muted">この画面は準備中です。</p>
    <div class="field"><label for="memo">メモ（確認用）</label><input id="memo" class="input" type="text" autocomplete="off"></div>`;
  a.querySelector('h2').textContent = label;
  const status = document.createElement('p');
  status.className = 'muted';
  status.id = 'masters-status';
  status.textContent = mastersText(masters);
  a.querySelector('h2').after(status);
  const b = document.createElement('section');
  b.className = 'sec';
  b.innerHTML = '<h2>長い本文（スクロールの確認用）</h2>';
  for (let i = 1; i <= 30; i++) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = `${i} 行目：スクロール位置が、開閉や回転のあとも保たれることを確かめるための文章です。`;
    b.append(p);
  }
  el.append(a, b);
  bindForm(a, state, key); // 作り直しても入力を残す
  return el;
}
