// 緯度・経度を、日本地図の SVG の座標（viewBox 0 0 300 330）に直す。純粋な関数だけ。
// 本土は等角的な簡易図法（経度に cos(36°) をかける）、沖縄は左上の挿入枠に別の式で置く。

export const MAIN = { lng0: 128, lat0: 46, scale: 20, kx: Math.cos(36 * Math.PI / 180) };
export const INSET = { lng0: 126.6, lat0: 27.0, scale: 20, x: 8, y: 8, w: 84, h: 64 };
export const VIEWBOX = '0 0 300 330';

const round2 = (v) => Math.round(v * 100) / 100;

/** 沖縄の挿入枠に置く点か（北緯28度より南、かつ東経131度より西）。 */
export function isInset(lat, lng) {
  return lat < 28 && lng < 131;
}

/** 緯度・経度 → [x, y]（小数2桁）。 */
export function project(lat, lng) {
  if (isInset(lat, lng)) {
    return [
      round2((lng - INSET.lng0) * INSET.scale * MAIN.kx + INSET.x),
      round2((INSET.lat0 - lat) * INSET.scale + INSET.y),
    ];
  }
  return [
    round2((lng - MAIN.lng0) * MAIN.scale * MAIN.kx),
    round2((MAIN.lat0 - lat) * MAIN.scale),
  ];
}
