// 設定（未ログイン：localStorage、ログイン：user_settings）。設計書 4.2・4.5・7.3・9章
import { validateSettings } from '../core/validate.js';
import { toFormError, FORM_MESSAGES } from './errors.js';

const KEY = 'kansen.settings';
const OFFLINE_MESSAGE = '保存できませんでした。通信できる場所でもう一度保存してください';
const LOAD_FAILED_MESSAGE = '設定を読み込めませんでした。通信できる場所で開き直してください';

export const SETTINGS_KEYS = ['support_club_id', 'origin_station', 'origin_prefecture', 'origin_airports', 'airport_checkin_min', 'airport_arrival_min', 'arrive_before_min', 'default_modes'];

export const DEFAULT_SETTINGS = Object.freeze({
  support_club_id: 'matsumoto',
  origin_station: '松本',
  origin_prefecture: '長野県',
  origin_airports: [
    { code: 'MMJ', name: '信州まつもと空港', station: null, access_min: 30, note: '松本駅からバス・タクシー' },
    { code: 'NGO', name: '中部国際空港', station: '中部国際空港', access_min: 180, note: '特急しなの＋名鉄' },
    { code: 'HND', name: '羽田空港', station: '羽田空港第1・第2ターミナル(京急)', access_min: 210, note: '特急あずさ＋京急' },
  ],
  airport_checkin_min: 60,
  airport_arrival_min: 20,
  arrive_before_min: 90,
  default_modes: ['train'],
});

// 項目ごとの型の検査（設計書 4.2）。合わない項目は既定値に戻す（4.5）
const isInt = (v) => Number.isInteger(v);
const TYPE_OK = {
  support_club_id: (v) => typeof v === 'string' && v !== '',
  origin_station: (v) => typeof v === 'string',
  origin_prefecture: (v) => typeof v === 'string',
  origin_airports: (v) => Array.isArray(v),   // 要素の形は pick で見る
  airport_checkin_min: isInt,
  airport_arrival_min: isInt,
  arrive_before_min: isInt,
  default_modes: (v) => Array.isArray(v) && v.every((m) => typeof m === 'string'),
};

// 設定の項目だけを取り出し、足りない・型の違う項目は既定で補う
function pick(src) {
  const out = {};
  for (const k of SETTINGS_KEYS) out[k] = TYPE_OK[k](src?.[k]) ? src[k] : structuredClone(DEFAULT_SETTINGS[k]);
  // 出発空港：code が文字列・access_min が整数でない要素は捨てる（配列そのものは残す）
  out.origin_airports = out.origin_airports.filter((a) => typeof a?.code === 'string' && Number.isInteger(a.access_min));
  return out;
}

function readLocal(local) {
  try {
    const raw = local.getItem(KEY);
    if (raw == null) return { settings: pick(null), exists: false };
    const v = JSON.parse(raw);
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return { settings: pick(null), exists: false };
    return { settings: pick(v), exists: true };
  } catch {
    return { settings: pick(null), exists: false }; // 壊れた値は捨てる
  }
}

// 保存の失敗（D34）。期限切れは expired: true も付ける（画面が ctx.onExpired() を呼ぶ）
function failure(e) {
  const r = toFormError(e);
  return r === 'expired' ? { ok: false, errors: { _form: FORM_MESSAGES.expired }, expired: true } : { ok: false, errors: r };
}

export function createSettingsStore({ client, local, userId }) {
  // 直前の読み込みに失敗したか。失敗したあとは保存しない（端末の値でアカウントの設定を上書きしないため）
  let loadFailed = false;

  async function load() {
    const r = await loadInner();
    loadFailed = r.exists === null;
    return r;
  }

  async function loadInner() {
    const dev = readLocal(local);
    if (userId == null) return dev;
    let res;
    try {
      res = await client.from('user_settings').select('*').eq('user_id', userId).maybeSingle();
    } catch (e) {
      return { settings: dev.settings, exists: null, error: { code: 'network', message: e?.message ?? 'network' } };
    }
    const { data, error } = res;
    if (error) return { settings: dev.settings, exists: null, error: { code: error.code ?? 'unknown', message: error.message ?? 'error' } };
    if (!data) return { settings: dev.settings, exists: false };
    return { settings: pick(data), exists: true };
  }

  async function save(values) {
    // 項目の置き換えはしない。足りない項目を既定で補い、設定以外の項目を捨てるだけ（型違いは検証で止める）
    const settings = {};
    for (const k of SETTINGS_KEYS) settings[k] = values?.[k] === undefined ? structuredClone(DEFAULT_SETTINGS[k]) : values[k];
    const v = validateSettings(settings);
    if (!v.ok) return { ok: false, errors: v.errors };
    if (userId != null && loadFailed) return { ok: false, errors: { _form: LOAD_FAILED_MESSAGE } };
    if (userId == null) {
      try {
        local.setItem(KEY, JSON.stringify(settings));
      } catch {
        return { ok: false, errors: { _form: OFFLINE_MESSAGE } };
      }
      return { ok: true, settings };
    }
    try {
      const { error } = await client.from('user_settings').upsert(settings, { onConflict: 'user_id' });
      if (error) return failure(error);
    } catch (e) {
      return failure(e);
    }
    return { ok: true, settings };
  }

  return { load, save };
}
