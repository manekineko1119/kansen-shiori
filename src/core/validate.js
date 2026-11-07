import { isValidDate } from './time.js';

// 入力の検証（設計書 5.4）。どれも { ok, errors } を返す。errors のキーは項目の場所（例：'airports.0.iata'）、値は画面に出す日本語の理由。

const isBlank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
const isInt = (v) => typeof v === 'number' && Number.isInteger(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const result = (errors, extra = {}) => ({ ok: Object.keys(errors).length === 0, errors, ...extra });

function requireText(errors, obj, key, label) {
  if (isBlank(obj[key])) errors[key] = `${label}を入力してください`;
}

function checkRange(errors, key, v, min, max, label, unit) {
  if (!isInt(v) || v < min || v > max) errors[key] = `${label}は${min}〜${max}${unit}の整数にしてください`;
}

function validateStation(errors, st, i) {
  const p = `stations.${i}`;
  if (isBlank(st?.name)) errors[`${p}.name`] = '駅名を入力してください';
  // 種類：nearest＝最寄り駅、shuttle＝シャトルバスの発着駅、bus＝路線バスの発着駅（設計書 4.1）
  if (!['nearest', 'shuttle', 'bus'].includes(st?.kind)) errors[`${p}.kind`] = '種類は最寄り駅・シャトルバスの駅・路線バスの駅のどれかにしてください';
  const toyoko = st?.toyoko ?? [];
  if (!Array.isArray(toyoko)) { errors[`${p}.toyoko`] = '東横インの形式が正しくありません'; return; }
  if (toyoko.length > 3) errors[`${p}.toyoko`] = '東横インは1駅につき3店までです';
  toyoko.forEach((h, j) => {
    if (!/^\d{5}$/.test(String(h?.hotel ?? ''))) errors[`${p}.toyoko.${j}.hotel`] = '店の番号は数字5桁にしてください';
    checkRange(errors, `${p}.toyoko.${j}.walk_min`, h?.walk_min, 0, 60, '徒歩', '分');
  });
}

export function validateStadium(s) {
  const errors = {};
  if (!/^[a-z0-9-]+$/.test(s.id ?? '')) errors.id = 'IDは英小文字・数字・ハイフンだけにしてください';
  requireText(errors, s, 'name', '名前');
  requireText(errors, s, 'prefecture', '都道府県');
  requireText(errors, s, 'address', '住所');
  if (!isNum(s.lat) || s.lat < 20 || s.lat > 46) errors.lat = '緯度は20〜46にしてください';
  if (!isNum(s.lng) || s.lng < 122 || s.lng > 154) errors.lng = '経度は122〜154にしてください';
  (s.stations ?? []).forEach((st, i) => validateStation(errors, st, i));
  (s.airports ?? []).forEach((a, i) => {
    if (!/^[A-Za-z]{3}$/.test(a?.iata ?? '')) errors[`airports.${i}.iata`] = '空港コードは英字3文字にしてください';
    checkRange(errors, `airports.${i}.access_min`, a?.access_min, 0, 300, '所要時間', '分');
  });
  const ag = s.agoda_area;
  if (ag !== null && ag !== undefined) {
    if ((ag.type !== 'region' && ag.type !== 'city') || !isInt(ag.id) || ag.id <= 0) {
      errors.agoda_area = 'Agodaの地域は、種類（region か city）と正の整数のIDにしてください';
    }
  }
  return result(errors);
}

export function validateClub(c) {
  const errors = {};
  requireText(errors, c, 'id', 'ID');
  requireText(errors, c, 'name', '名前');
  requireText(errors, c, 'short_name', '略称');
  return result(errors);
}

export function validateSettings(s) {
  const errors = {};
  (s.origin_airports ?? []).forEach((a, i) => {
    if (!/^[A-Za-z]{3,4}$/.test(a?.code ?? '')) errors[`origin_airports.${i}.code`] = '空港コードは英字3文字（都市コードは4文字）にしてください';
    checkRange(errors, `origin_airports.${i}.access_min`, a?.access_min, 0, 600, '所要時間', '分');
  });
  return result(errors);
}

export function validateFixture(f, clubIds) {
  const errors = {};
  if (!isValidDate(f.match_date)) errors.match_date = '日付を YYYY-MM-DD の形で入力してください';
  if (!isBlank(f.kickoff) && !/^([01]\d|2[0-3]):[0-5]\d$/.test(f.kickoff)) errors.kickoff = 'キックオフは HH:MM の形で入力してください';
  if (!clubIds.has(f.home_club_id)) errors.home_club_id = 'ホームは登録済みのクラブを選んでください';
  if (!clubIds.has(f.away_club_id)) errors.away_club_id = 'アウェイは登録済みのクラブを選んでください';
  else if (f.home_club_id === f.away_club_id) errors.away_club_id = 'ホームとアウェイは違うクラブにしてください';
  return result(errors);
}

export function validateTrip(t) {
  const errors = {};
  if (isBlank(t.fixture_id)) {
    if (isBlank(t.custom_venue)) errors.custom_venue = '試合を選ぶか、会場を入力してください';
    if (isBlank(t.custom_date)) errors.custom_date = '試合を選ぶか、日付を入力してください';
  }
  const len = typeof t.title === 'string' ? t.title.trim().length : 0;
  if (len < 1 || len > 50) errors.title = 'タイトルは1〜50文字にしてください';
  return result(errors);
}

const COST_KEYS = ['cost_transport', 'cost_lodging', 'cost_ticket', 'cost_goods', 'cost_food'];
const WATCH_STYLES = ['stadium', 'broadcast', 'public_viewing'];

export function validateMatchRecord(r) {
  const errors = {};
  for (const k of COST_KEYS) {
    const v = r[k];
    if (isBlank(v)) continue;
    if (!isInt(v) || v < 0) errors[k] = '費用は0以上の整数で入力してください';
  }
  if (!WATCH_STYLES.includes(r.watch_style)) errors.watch_style = '観戦方法を選んでください';
  return result(errors);
}

export function validateEmail(email) {
  const value = String(email ?? '').trim().toLowerCase();
  const errors = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? {} : { email: 'メールアドレスの形が正しくありません' };
  return result(errors, { value });
}
