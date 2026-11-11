// 画面の共通の部品。色は CSS の変数だけ（クラスで指定する）

// el('a', { class: 'row', href: '#/x', onclick: fn }, '文字', 子の要素, [配列も可])
export function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  node.append(...children.flat(Infinity).filter((c) => c != null && c !== false));
  return node;
}

function rowBody(label, sub) {
  return el('span', { class: 'row-main' }, el('span', { class: 'row-label' }, label), sub ? el('span', { class: 'row-sub muted' }, sub) : null);
}

// 外部サイトの行。行全体がタップ領域で、右端に外部リンクの印
export function extLink({ href, label, sub }) {
  return el('a', { class: 'row row-ext', href, target: '_blank', rel: 'noopener' },
    rowBody(label, sub), el('span', { class: 'row-mark', 'aria-hidden': 'true' }, '↗'), el('span', { class: 'sr-only' }, '（外部サイトを開く）'));
}

// アプリ内の移動の行（右端に「›」）
export function innerLink({ href, label, sub }) {
  return el('a', { class: 'row', href }, rowBody(label, sub), el('span', { class: 'row-mark', 'aria-hidden': 'true' }, '›'));
}

const OUTCOME = { win: ['win', '○', '勝ち'], lose: ['lose', '●', '負け'], draw: ['draw', '△', '引き分け'] };

// 勝ち・負け・引き分けの印。outcome が null（スコア未登録）なら「結果未登録」
export function outcomeBadge(outcome) {
  const o = OUTCOME[outcome];
  if (!o) return el('span', { class: 'badge badge-none' }, '結果未登録');
  return el('span', { class: `badge ${o[0]}`, 'aria-label': o[2] }, o[1]);
}

export function section(title, ...children) {
  return el('section', { class: 'sec' }, el('h2', null, title), ...children);
}

// 一覧＋詳細（D31）。両方を作り、出し分けは CSS だけ。詳細を選んでいるとき（detail あり）は S で一覧を隠す
export function split({ list, detail }) {
  return el('div', { class: 'split', 'data-detail': detail ? '1' : null },
    el('div', { class: 'split-list' }, list), el('div', { class: 'split-detail' }, detail ?? null));
}
