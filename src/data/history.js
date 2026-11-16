// 検索履歴（端末の localStorage。設計書 4.5）
import { pushHistory, removeHistory } from '../core/search-query.js';

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
  const save = (next) => {
    try {
      local.setItem(KEY, JSON.stringify(next));
    } catch (e) {
      console.warn('検索履歴を保存できませんでした', e);
    }
    return next;
  };
  const push = (qs) => save(pushHistory(list(), qs));
  const remove = (qs) => save(removeHistory(list(), qs)); // 1件ずつ消す（確認なし）
  return { list, push, remove };
}
