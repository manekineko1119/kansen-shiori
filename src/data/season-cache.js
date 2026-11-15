// シーズンごとの試合と、シーズンの選択肢をメモリに覚える（観戦記録の一覧。設計書 3.4.2）
import { fetchSeasonFixtures, fetchSeasons, fetchSeasonClubs } from './masters.js';
import { recordSeasons } from '../core/record-list.js';

// fixtures(id)・seasons()・mapSeasons()：undefined＝読み込み中、null＝読めなかった、それ以外は配列。同じものは通信1回。読み終わると onChange()
// seasons() は地図だけのシーズン（map_only）を除いた選択肢（観戦記録・管理画面）。mapSeasons() は全部（地図）
export function createSeasonCache({ client, onChange }) {
  const fixtures = new Map(); // シーズンID → 配列 | null
  const clubs = new Map(); // シーズンID → season_clubs の行の配列 | null（管理画面）
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

  function allSeasons() {
    if (seasons !== undefined) return seasons;
    if (!seasonsPending) {
      seasonsPending = true;
      load('\0seasons', (c) => fetchSeasons({ client: c }), (v) => { seasons = v; seasonsPending = false; });
    }
    return undefined;
  }

  return {
    fixtures(id) {
      if (fixtures.has(id)) return fixtures.get(id);
      if (!pending.has(id)) load(id, (c) => fetchSeasonFixtures({ client: c }, id), (v) => fixtures.set(id, v));
      return undefined;
    },
    seasonClubs(id) {
      if (clubs.has(id)) return clubs.get(id);
      const key = ` clubs:${id}`;
      if (!pending.has(key)) load(key, (c) => fetchSeasonClubs({ client: c }, id), (v) => clubs.set(id, v));
      return undefined;
    },
    seasons() { return recordSeasons(allSeasons()); },
    mapSeasons: allSeasons,
    // 試合の情報を保存したあとに、覚えた試合を捨てる
    reset() { fixtures.clear(); },
    // シーズンを作った・所属クラブを変えたあと（管理画面）：選択肢・所属クラブ・試合を捨てて読み直す
    resetSeasons() { fixtures.clear(); clubs.clear(); seasons = undefined; },
  };
}
