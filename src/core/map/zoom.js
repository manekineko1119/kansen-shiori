// 地図だけの拡大・移動の計算（設計書 3.8）。見る範囲（SVG の viewBox）を { x, y, w, h } で持つ
// full：地図全体の範囲。拡大の倍率は full.w / view.w

export const MIN_SCALE = 1;
export const MAX_SCALE = 8;

export const scaleOf = (view, full) => full.w / view.w;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// 倍率を 1〜8 に収め、見る範囲を地図の中に収める（縦横の比は full に合わせる）
export function clampView(view, full) {
  const scale = clamp(scaleOf(view, full), MIN_SCALE, MAX_SCALE);
  const w = full.w / scale;
  const h = full.h / scale;
  return {
    x: clamp(view.x, full.x, full.x + full.w - w),
    y: clamp(view.y, full.y, full.y + full.h - h),
    w,
    h,
  };
}

// (px, py)（地図の座標）を動かさずに factor 倍する。factor < 1 で縮める
export function zoomAt(view, full, factor, px, py) {
  const scale = clamp(scaleOf(view, full) * factor, MIN_SCALE, MAX_SCALE);
  const w = full.w / scale;
  const ratio = w / view.w;
  return clampView({ x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio, w, h: view.h * ratio }, full);
}

// 地図を (dx, dy)（地図の座標）だけ動かす。指を右に動かすと、見る範囲は左へずれる
export const panBy = (view, full, dx, dy) => clampView({ ...view, x: view.x - dx, y: view.y - dy }, full);

// 画面の位置 (cx, cy) を地図の座標にする。rect は SVG の要素の getBoundingClientRect()
// SVG は preserveAspectRatio の既定（xMidYMid meet）なので、比が違うときは真ん中に寄せた余白を引く
export function clientToSvg(view, rect, cx, cy) {
  const s = Math.min(rect.width / view.w, rect.height / view.h);
  const ox = rect.left + (rect.width - view.w * s) / 2;
  const oy = rect.top + (rect.height - view.h * s) / 2;
  return [view.x + (cx - ox) / s, view.y + (cy - oy) / s];
}

export const viewBoxText = (v) => `${v.x} ${v.y} ${v.w} ${v.h}`;
