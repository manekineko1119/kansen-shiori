// 検索履歴（端末の localStorage。設計書 4.5）
import { pushHistory } from '../core/search-query.js';

const KEY = 'kansen.history';

export function createHistory(local) {
  const list = () => {
    try {
      const v = JSON.parse(local.getItem(KEY));
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
    } catch {
      return []; // 壊れた値は捨てる
    }
  };
  const push = (qs) => {
    const next = pushHistory(list(), qs);
    try {
      local.setItem(KEY, JSON.stringify(next));
    } catch (e) {
      console.warn('検索履歴を保存できませんでした', e);
    }
    return next;
  };
  return { list, push };
}
