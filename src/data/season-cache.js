// シーズンごとの試合と、シーズンの選択肢をメモリに覚える（観戦記録の一覧。設計書 3.4.2）
import { fetchSeasonFixtures, fetchSeasons } from './masters.js';

// fixtures(id)・seasons()：undefined＝読み込み中、null＝読めなかった、それ以外は配列。同じものは通信1回。読み終わると onChange()
export function createSeasonCache({ client, onChange }) {
  const fixtures = new Map(); // シーズンID → 配列 | null
  const pending = new Set();
  let seasons; // undefined | 配列 | null
  let seasonsPending = false;

  async function load(key, make, store) {
    pending.add(key);
    let value = null;
    try {
      value = await make(client());
    } catch {
      value = null; // 通信できないときも null を覚える（reset か再読み込みで読み直す）
    }
    store(value);
    pending.delete(key);
    onChange();
  }

  return {
    fixtures(id) {
      if (fixtures.has(id)) return fixtures.get(id);
      if (!pending.has(id)) load(id, (c) => fetchSeasonFixtures({ client: c }, id), (v) => fixtures.set(id, v));
      return undefined;
    },
    seasons() {
      if (seasons !== undefined) return seasons;
      if (!seasonsPending) {
        seasonsPending = true;
        load('\0seasons', (c) => fetchSeasons({ client: c }), (v) => { seasons = v; seasonsPending = false; });
      }
      return undefined;
    },
    // 試合の情報を保存したあとに、覚えた試合を捨てる
    reset() { fixtures.clear(); },
  };
}
