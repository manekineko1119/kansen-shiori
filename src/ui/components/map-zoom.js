// 地図だけを拡大・移動する（設計書 3.8）。ページ全体は拡大しない。計算は src/core/map/zoom.js
// 2本の指・Ctrl＋ホイール（タッチパッドのつまむ操作）・＋／−／全体のボタンで拡大する。拡大中は1本の指で動かす
import { el } from './parts.js';
import { MIN_SCALE, MAX_SCALE, scaleOf, zoomAt, panBy, clientToSvg, viewBoxText } from '../../core/map/zoom.js';

const TAP_SLOP = 8; // これより指が動いたら、タップ（県の一覧を出す）として扱わない
const STEP = 1.5; // ＋・−のボタン1回の倍率

// svg：viewBox を持つ地図の SVG。onScale(scale)：倍率が変わったとき（印の大きさを保つため）
// 戻り値：＋・−・全体のボタンの要素
export function attachZoom(svg, { onScale }) {
  const [fx, fy, fw, fh] = svg.getAttribute('viewBox').split(/\s+/).map(Number);
  const full = { x: fx, y: fy, w: fw, h: fh };
  let view = full;

  const btn = (label, text, onclick) => el('button', { class: 'jmap-zbtn', type: 'button', 'aria-label': label, onclick }, text);
  const plus = btn('地図を拡大', '＋', () => zoomCenter(STEP));
  const minus = btn('地図を縮小', '−', () => zoomCenter(1 / STEP));
  const reset = btn('地図の全体を表示', '全体', () => set(full));
  const controls = el('div', { class: 'jmap-zoom' }, plus, minus, reset);

  function set(next) {
    view = next;
    svg.setAttribute('viewBox', viewBoxText(view));
    const scale = scaleOf(view, full);
    svg.classList.toggle('zoomed', scale > MIN_SCALE + 1e-6); // 拡大中は1本の指でページをスクロールさせない（CSS の touch-action）
    plus.disabled = scale >= MAX_SCALE - 1e-6;
    minus.disabled = reset.disabled = scale <= MIN_SCALE + 1e-6;
    onScale(scale);
  }
  function zoomCenter(factor) {
    set(zoomAt(view, full, factor, view.x + view.w / 2, view.y + view.h / 2));
  }
  const toSvg = (cx, cy) => clientToSvg(view, svg.getBoundingClientRect(), cx, cy);
  const pxToSvg = () => { // 画面の 1px が地図の座標でいくつか
    const r = svg.getBoundingClientRect();
    return 1 / Math.min(r.width / view.w, r.height / view.h);
  };

  // 指・マウス。2本ならつまんで拡大、1本なら拡大中だけ動かす
  const pts = new Map();
  let moved = 0;
  let pinch = null; // { dist, mx, my }
  const pair = () => {
    const [a, b] = [...pts.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };
  svg.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // マウスは地図の外に出てもドラッグを続ける（離したときに pointerup が地図に届く）
    if (e.pointerType === 'mouse') svg.setPointerCapture?.(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) moved = 0;
    if (pts.size === 2) { pinch = pair(); moved = TAP_SLOP + 1; }
  });
  svg.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pts.size >= 2 && pinch) {
      const now = pair();
      const k = pxToSvg();
      let next = panBy(view, full, (now.mx - pinch.mx) * k, (now.my - pinch.my) * k);
      if (pinch.dist > 0) {
        const [sx, sy] = clientToSvg(next, svg.getBoundingClientRect(), now.mx, now.my);
        next = zoomAt(next, full, now.dist / pinch.dist, sx, sy);
      }
      pinch = now;
      set(next);
      return;
    }
    moved += Math.abs(dx) + Math.abs(dy);
    if (svg.classList.contains('zoomed') && (e.pointerType !== 'mouse' || e.buttons === 1)) {
      const k = pxToSvg();
      set(panBy(view, full, dx * k, dy * k));
    }
  });
  const up = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  svg.addEventListener('lostpointercapture', up);
  // なぞった・つまんだあとの click は、県の一覧を出さない（先に受けて止める）
  svg.addEventListener('click', (e) => {
    if (moved > TAP_SLOP) { e.stopImmediatePropagation(); e.preventDefault(); }
    moved = 0;
  }, { capture: true });

  // Ctrl＋ホイール（タッチパッドでつまむと ctrlKey 付きで来る）は地図だけを拡大。ふつうのホイールはページのスクロール
  svg.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const [sx, sy] = toSvg(e.clientX, e.clientY);
    set(zoomAt(view, full, Math.exp(-e.deltaY * 0.01), sx, sy));
  }, { passive: false });
  // Safari のつまむ操作（gesture*）でページが拡大されないようにする
  for (const t of ['gesturestart', 'gesturechange']) svg.addEventListener(t, (e) => e.preventDefault());

  set(full);
  return controls;
}
