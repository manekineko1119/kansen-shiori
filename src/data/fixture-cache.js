// 共通データにない試合（前のシーズンなど）を ID で1件読み、結果をメモリに覚える（設計書 4.5、D28）
import { fetchFixturesByIds } from './masters.js';

// get(id)：undefined＝読み込み中、null＝見つからない・読めない、それ以外は試合。読み終わると onChange()（画面の描き直し）
export function createFixtureCache({ client, onChange }) {
  const done = new Map(); // id → 試合 | null
  const pending = new Set();
  return {
    get(id) {
      if (done.has(id)) return done.get(id);
      if (!pending.has(id)) {
        pending.add(id);
        (async () => {
          let found = null;
          try {
            found = (await fetchFixturesByIds({ client: client() }, [id]))[0] ?? null;
          } catch {
            found = null; // 通信できないときも null を覚える（再読み込みで読み直す）
          }
          done.set(id, found);
          pending.delete(id);
          onChange();
        })();
      }
      return undefined;
    },
    // 試合の情報を保存したあとに、覚えた値を捨てる
    forget(id) { done.delete(id); },
  };
}
