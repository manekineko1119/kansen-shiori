// 設定画面の入力 → 保存する設定への変換（設計書 3章・4.2、D30）。純粋な関数だけ
import { toHalfWidth } from '../../supabase/functions/_shared/text.js';

export const MAX_AIRPORTS = 5;
export const MODE_KEYS = ['train', 'car', 'bus', 'plane'];

const text = (v) => String(v ?? '').trim();

// 全角数字を半角にして整数にする。整数にできなければ NaN（validateSettings が項目ごとの理由を出す）
function toInt(v) {
  const s = toHalfWidth(v).trim();
  return /^\d+$/.test(s) ? Number(s) : NaN;
}

const intOr = (values, key, fallback) => (values[key] === undefined ? fallback : toInt(values[key]));

// 空港の行の数（0〜最大5。なければ null）
function rowCount(values) {
  if (values.airport_count === undefined) return null;
  const n = Number(toHalfWidth(values.airport_count));
  return Number.isInteger(n) ? Math.min(Math.max(n, 0), MAX_AIRPORTS) : 0;
}

// コードが入っている行の、画面での行の番号（保存される出発空港の並びと同じ順。理由を元の行に出すために使う）
export function airportRowIndexes(values) {
  const n = rowCount(values) ?? 0;
  const out = [];
  for (let i = 0; i < n && out.length < MAX_AIRPORTS; i += 1) {
    if (text(values[`airport_${i}_code`]) !== '') out.push(i);
  }
  return out;
}

// values：入力欄の name → 文字列（チェックは true/false）。base：今の設定（値のない項目の補い）
export function settingsFromForm(values, base) {
  const airports = rowCount(values) === null
    ? base.origin_airports
    : airportRowIndexes(values).map((i) => ({
      code: toHalfWidth(values[`airport_${i}_code`]).trim().toUpperCase(),
      name: text(values[`airport_${i}_name`]),
      station: text(values[`airport_${i}_station`]) || null,
      access_min: toInt(values[`airport_${i}_access_min`]),
      note: text(values[`airport_${i}_note`]),
    }));
  const anyMode = MODE_KEYS.some((m) => values[`mode_${m}`] !== undefined);
  return {
    support_club_id: values.support_club_id ?? base.support_club_id,
    origin_station: values.origin_station === undefined ? base.origin_station : text(values.origin_station),
    origin_prefecture: values.origin_prefecture === undefined ? base.origin_prefecture : text(values.origin_prefecture),
    origin_airports: airports,
    airport_checkin_min: intOr(values, 'airport_checkin_min', base.airport_checkin_min),
    airport_arrival_min: intOr(values, 'airport_arrival_min', base.airport_arrival_min),
    arrive_before_min: intOr(values, 'arrive_before_min', base.arrive_before_min),
    default_modes: anyMode ? MODE_KEYS.filter((m) => values[`mode_${m}`] === true) : base.default_modes,
  };
}

// validateSettings が見ない必須の項目（空だと検索の出発地が決まらない）
export function requiredErrors(settings) {
  const errors = {};
  if (text(settings.origin_station) === '') errors.origin_station = '出発駅を入力してください';
  if (text(settings.origin_prefecture) === '') errors.origin_prefecture = '都道府県を選んでください';
  return errors;
}
