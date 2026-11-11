// 端末に保存するスナップショット（設計書 4.5）。{ savedAt, data } の形で kv に置く
import { jstNow } from '../core/time.js';

export const SNAPSHOT_KEYS = { masters: 'masters', personal: (userId) => `personal:${userId}` };

export function createSnapshot(kv) {
  return {
    async load(key) {
      try {
        const v = await kv.get(key);
        if (v && typeof v === 'object' && Number.isFinite(v.savedAt) && 'data' in v) return { savedAt: v.savedAt, data: v.data };
        return null;
      } catch {
        return null;
      }
    },
    async save(key, data, nowMs) {
      await kv.set(key, { savedAt: nowMs, data });
    },
    async remove(key) {
      await kv.delete(key);
    },
  };
}

// 「オフライン（最終更新：11月10日）」。日付は日本時間
export function offlineLabel(savedAtMs) {
  const [, m, d] = jstNow(savedAtMs).date.split('-').map(Number);
  return `オフライン（最終更新：${m}月${d}日）`;
}
