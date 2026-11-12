// 日本の都道府県の形（SVG の d）を作って src/core/map/japan-shape.js に書き出す。
// アプリからは import しない（ビルド用の道具。依存なし、Node の組み込みだけ）。
//
// 元のデータ：Natural Earth 10m Admin 1 – States, Provinces（ne_10m_admin_1_states_provinces.geojson）
//   版：5.1.1（nvkelso/natural-earth-vector の git タグ v5.1.1）。パブリックドメイン
//   取り元：https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.1/geojson/ne_10m_admin_1_states_provinces.geojson
//   元のデータはリポジトリに入れない。
// 動かし方：node tools/build-japan-map.mjs <geojson のパス>
// 単純化：Douglas–Peucker、許容の幅 TOLERANCE px、面積 MIN_AREA px² 未満の島・穴は捨てる。
//   出力が 150KB を超えたら TOLERANCE を広げる。

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { project, VIEWBOX, INSET } from '../src/core/map/project.js';
import { TOYOKO_PREFECTURE_CODES } from '../src/core/links/toyoko-inn.js';

const TOLERANCE = 0.3;
const MIN_AREA = 0.5;
const MAX_BYTES = 150 * 1024;
const OUT = new URL('../src/core/map/japan-shape.js', import.meta.url);

const path = process.argv[2];
if (!path) {
  console.error('使い方: node tools/build-japan-map.mjs <ne_10m_admin_1_states_provinces.geojson>');
  process.exit(1);
}

const geo = JSON.parse(readFileSync(path, 'utf8'));
const features = geo.features.filter((f) => f.properties?.admin === 'Japan');

const nameByCode = new Map(Object.entries(TOYOKO_PREFECTURE_CODES).map(([n, c]) => [c, n]));

/** 外側の輪と穴の輪を、多角形ごとの配列にそろえる。[[ring, ring…], …] */
function polygonsOf(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  throw new Error(`想定外の形: ${geometry.type}`);
}

/** 多角形（外側の輪）を捨てるか。 */
function dropPolygon(code, outer) {
  const lats = outer.map((p) => p[1]);
  const lngs = outer.map((p) => p[0]);
  if (code === 47) {
    // 沖縄県：東経126.5度より西だけ（先島）、東経131度以東（大東）は捨てる（枠に入らない）
    return Math.max(...lngs) < 126.5 || Math.min(...lngs) >= 131;
  }
  // 沖縄県以外：北緯30度より南だけの多角形（小笠原・奄美など）を捨てる
  return Math.max(...lats) < 30;
}

function area(ring) {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

function distToSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function dp(points, tol) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let max = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = distToSeg(points[i], points[s], points[e]);
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function buildRing(ring, tol) {
  let pts = ring.map(([lng, lat]) => project(lat, lng));
  // 閉じた輪の最後の点（始点と同じ）を外す
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  if (area(pts) < MIN_AREA) return null;
  pts = dp(pts, tol);
  if (pts.length < 3 || area(pts) < MIN_AREA) return null;
  const f = (v) => String(Math.round(v * 10) / 10);
  return 'M' + pts.map((p) => `${f(p[0])},${f(p[1])}`).join('L') + 'Z';
}

function build(tol) {
  const byCode = new Map();
  for (const f of features) {
    const m = /^JP-(\d{2})$/.exec(f.properties.iso_3166_2 ?? '');
    if (!m) throw new Error(`iso_3166_2 が読めない: ${f.properties.iso_3166_2}`);
    const code = Number(m[1]);
    const name = nameByCode.get(code);
    if (!name) throw new Error(`番号 ${code} の名前がない`);
    const parts = [];
    for (const rings of polygonsOf(f.geometry)) {
      if (dropPolygon(code, rings[0])) continue;
      for (const ring of rings) {
        const d = buildRing(ring, tol);
        if (d) parts.push(d);
      }
    }
    if (!parts.length) throw new Error(`${name} の形が空`);
    byCode.set(code, { code, name, d: parts.join('') });
  }
  const prefectures = [];
  for (let c = 1; c <= 47; c++) {
    if (!byCode.has(c)) throw new Error(`都道府県 ${c} がそろっていない（47必要）`);
    prefectures.push(byCode.get(c));
  }
  const lines = prefectures.map((p) => `    { code: ${p.code}, name: ${JSON.stringify(p.name)}, d: ${JSON.stringify(p.d)} },`);
  const header = `// 日本の都道府県の形。tools/build-japan-map.mjs が作る（手で書き換えない）。
// 元のデータ：Natural Earth 10m Admin 1 – States, Provinces 5.1.1（パブリックドメイン）
//   https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.1/geojson/ne_10m_admin_1_states_provinces.geojson
// 動かし方：node tools/build-japan-map.mjs <geojson のパス>
// 単純化：Douglas–Peucker 許容 ${tol}px、面積 ${MIN_AREA}px² 未満の島・穴は捨てた。沖縄県は左上の挿入枠に置く（project.js）。
`;
  const body = `${header}
export const JAPAN_SHAPE = {
  viewBox: ${JSON.stringify(VIEWBOX)},
  inset: { x: ${INSET.x}, y: ${INSET.y}, w: ${INSET.w}, h: ${INSET.h} },
  prefectures: [
${lines.join('\n')}
  ],
};

export const ATTRIBUTION = 'Made with Natural Earth.';
`;
  return body;
}

let tol = TOLERANCE;
let out = build(tol);
while (Buffer.byteLength(out) > MAX_BYTES && tol < 5) {
  tol = Math.round((tol + 0.1) * 100) / 100;
  out = build(tol);
}
writeFileSync(OUT, out);
const kb = Math.round(statSync(OUT).size / 1024);
console.log(`47都道府県、${kb} KB（許容 ${tol}px）`);
