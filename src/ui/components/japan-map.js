// 日本地図の SVG（行ったスタジアムの地図。地図の spec 4.2）。DOM を作るだけ。座標の計算は src/core/map/
import { el } from './parts.js';
import { JAPAN_SHAPE, ATTRIBUTION } from '../../core/map/japan-shape.js';
import { project } from '../../core/map/project.js';
import { stadiumsInPrefecture } from '../../core/stadium-map.js';

const OKINAWA = '沖縄県';

const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs, ...children) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs ?? {})) node.setAttribute(k, String(v));
  node.append(...children.flat(Infinity).filter((c) => c != null && c !== false));
  return node;
}

// 行った会場の印の半径。回数に関係なく同じ大きさ（回数は表に出す）
const PIN_R = 4.6;

// visitedPrefectures：塗る都道府県の名前の配列。pins：[{ stadium, count }]（行った会場）。baseStadiums：薄い印の会場
// onPick(stadium, count)：タップした所の近くの会場の一覧で選んだとき
export function renderJapanMap({ visitedPrefectures, pins, baseStadiums, onPick }) {
  const painted = new Set(visitedPrefectures);
  const counts = new Map(pins.map((p) => [p.stadium.id, p.count]));
  const placed = (s) => Number.isFinite(s.lat) && Number.isFinite(s.lng);
  const at = (s) => project(s.lat, s.lng);

  const svg = svgEl('svg', { class: 'jmap', viewBox: JAPAN_SHAPE.viewBox, role: 'img', 'aria-label': `日本地図。行った会場${pins.length}か所。行った会場は下の表にもあります。` });
  svg.append(svgEl('g', { class: 'jmap-land' },
    JAPAN_SHAPE.prefectures.map((p) => svgEl('path', { d: p.d, class: painted.has(p.name) ? 'pref visited' : 'pref', 'data-pref': p.name }, svgEl('title', null, p.name)))));
  const { x, y, w, h } = JAPAN_SHAPE.inset;
  svg.append(svgEl('rect', { class: 'jmap-inset', x, y, width: w, height: h, 'data-pref': OKINAWA })); // 枠の中は沖縄県として扱う
  svg.append(svgEl('g', { class: 'jmap-base' },
    baseStadiums.filter((s) => placed(s) && !counts.has(s.id)).map((s) => { const [cx, cy] = at(s); return svgEl('circle', { cx, cy, r: 2.6, 'data-pref': s.prefecture }); })));
  svg.append(svgEl('g', { class: 'jmap-pins' },
    pins.filter((p) => placed(p.stadium)).map((p) => {
      const [cx, cy] = at(p.stadium);
      return svgEl('circle', { cx, cy, r: PIN_R, 'data-pref': p.stadium.prefecture });
    })));

  const popup = el('div', { class: 'jmap-popup', hidden: true });
  const known = new Map([...baseStadiums, ...pins.map((p) => p.stadium)].filter(placed).map((s) => [s.id, s]));

  // タップした所の県（印を押したときはその会場の県）の会場を一覧に出す。県の外（海）なら閉じる
  svg.addEventListener('click', (e) => {
    const hit = document.elementsFromPoint(e.clientX, e.clientY).find((n) => svg.contains(n) && n.dataset?.pref);
    const pref = hit?.dataset.pref ?? null;
    const list = stadiumsInPrefecture([...known.values()], pref);
    popup.replaceChildren();
    popup.hidden = !pref;
    if (!pref) return;
    popup.append(el('p', { class: 'jmap-pref' }, pref));
    if (list.length === 0) popup.append(el('p', { class: 'muted' }, 'この県の会場はありません。'));
    for (const s of list) {
      const count = counts.get(s.id) ?? 0;
      const label = `${s.name}${count ? `（${count}回）` : '（まだ行っていない）'}`;
      popup.append(el('button', { class: 'jmap-pick', type: 'button', onclick: () => { popup.hidden = true; onPick(s, count); } }, label));
    }
    if (!popup.hidden) popup.scrollIntoView({ block: 'nearest' }); // 一覧が画面の外に出ないように
  });

  return el('div', { class: 'jmap-wrap' }, svg, popup, el('p', { class: 'jmap-credit muted' }, ATTRIBUTION));
}
