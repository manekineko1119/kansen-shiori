// 設定（未ログイン：localStorage、ログイン：user_settings）。設計書 4.2・4.5・7.3・9章
import { validateSettings } from '../core/validate.js';

const KEY = 'kansen.settings';
const OFFLINE_MESSAGE = '保存できませんでした。通信できる場所でもう一度保存してください';

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

// 設定の項目だけを取り出し、足りない項目は既定で補う
function pick(src) {
  const out = {};
  for (const k of SETTINGS_KEYS) out[k] = src?.[k] ?? structuredClone(DEFAULT_SETTINGS[k]);
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

export function createSettingsStore({ client, local, userId }) {
  async function load() {
    const dev = readLocal(local);
    if (userId == null) return dev;
    const { data, error } = await client.from('user_settings').select('*').eq('user_id', userId).maybeSingle();
    if (error) throw new Error(error.message ?? 'error');
    if (!data) return { settings: dev.settings, exists: false };
    return { settings: pick(data), exists: true };
  }

  async function save(values) {
    const settings = pick(values);
    const v = validateSettings(settings);
    if (!v.ok) return { ok: false, errors: v.errors };
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
      if (error) {
        const msg = error.code === '42501' ? '権限がありません' : OFFLINE_MESSAGE;
        return { ok: false, errors: { _form: msg } };
      }
    } catch {
      return { ok: false, errors: { _form: OFFLINE_MESSAGE } };
    }
    return { ok: true, settings };
  }

  return { load, save };
}
