// 日本地図の SVG（行ったスタジアムの地図。地図の spec 4.2）。DOM を作るだけ。座標の計算は src/core/map/
import { el } from './parts.js';
import { JAPAN_SHAPE, ATTRIBUTION } from '../../core/map/japan-shape.js';
import { project } from '../../core/map/project.js';

const NS = 'http://www.w3.org/2000/svg';
const TAP_RADIUS = 12; // タップした所から、この距離（地図の座標）以内の会場を一覧に出す

function svgEl(tag, attrs, ...children) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs ?? {})) node.setAttribute(k, String(v));
  node.append(...children);
  return node;
}

// 印の半径（行った回数に応じて）
export const pinRadius = (count) => 3 + Math.sqrt(count) * 1.6;

// visitedPrefectures：塗る都道府県の名前の配列。pins：[{ stadium, count }]（行った会場）。baseStadiums：薄い印の会場
// onPick(stadium, count)：一覧で選んだとき。null なら一覧は名前だけ（未ログイン）
export function renderJapanMap({ visitedPrefectures, pins, baseStadiums, onPick }) {
  const painted = new Set(visitedPrefectures);
  const counts = new Map(pins.map((p) => [p.stadium.id, p.count]));
  const placed = (s) => Number.isFinite(s.lat) && Number.isFinite(s.lng);
  const at = (s) => project(s.lat, s.lng);

  const svg = svgEl('svg', { class: 'jmap', viewBox: JAPAN_SHAPE.viewBox, role: 'img', 'aria-label': `日本地図。行った会場${pins.length}か所` });
  svg.append(svgEl('g', { class: 'jmap-land' },
    JAPAN_SHAPE.prefectures.map((p) => svgEl('path', { d: p.d, class: painted.has(p.name) ? 'pref visited' : 'pref' }, svgEl('title', null, p.name)))));
  const { x, y, w, h } = JAPAN_SHAPE.inset;
  svg.append(svgEl('rect', { class: 'jmap-inset', x, y, width: w, height: h }));
  svg.append(svgEl('g', { class: 'jmap-base' },
    baseStadiums.filter((s) => placed(s) && !counts.has(s.id)).map((s) => { const [cx, cy] = at(s); return svgEl('circle', { cx, cy, r: 2.6 }); })));
  svg.append(svgEl('g', { class: 'jmap-pins' },
    [...pins].sort((a, b) => b.count - a.count).filter((p) => placed(p.stadium)).map((p) => {
      const [cx, cy] = at(p.stadium);
      return svgEl('circle', { cx, cy, r: pinRadius(p.count) });
    })));

  const popup = el('div', { class: 'jmap-popup', hidden: true });
  const known = new Map([...baseStadiums, ...pins.map((p) => p.stadium)].filter(placed).map((s) => [s.id, s]));

  svg.addEventListener('click', (e) => {
    const m = svg.getScreenCTM();
    if (!m) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(m.inverse());
    const near = [...known.values()].filter((s) => { const [sx, sy] = at(s); return Math.hypot(sx - p.x, sy - p.y) <= TAP_RADIUS; });
    popup.replaceChildren();
    popup.hidden = near.length === 0;
    for (const s of near) {
      const count = counts.get(s.id) ?? 0;
      const label = `${s.name}${count ? `（${count}回）` : '（まだ行っていない）'}`;
      popup.append(onPick
        ? el('button', { class: 'jmap-pick', type: 'button', onclick: () => { popup.hidden = true; onPick(s, count); } }, label)
        : el('p', { class: 'jmap-pick' }, label));
    }
  });

  return el('div', { class: 'jmap-wrap' }, svg, popup, el('p', { class: 'jmap-credit muted' }, ATTRIBUTION));
}
