// 宿：Agoda の検索URLを作る（設計書 6章、FR-13）。

const TOP = 'https://www.agoda.com/ja-jp/';

/** area は { type: 'region'|'city', id }。null ならトップ。checkIn は 'YYYY-MM-DD'、nights は泊数。 */
export function agodaUrl({ area, checkIn, nights }) {
  if (!area) return TOP;
  return `${TOP}search?${area.type}=${area.id}&checkIn=${checkIn}&los=${nights}&rooms=1&adults=1&children=0`;
}

/** 管理者が貼ったAgodaのURLからエリアを読む。読めなければ null。 */
export function parseAgodaArea(url) {
  let params;
  try {
    params = new URL(url).searchParams;
  } catch {
    return null;
  }
  for (const type of ['region', 'city']) {
    const value = params.get(type);
    if (value !== null && /^\d+$/.test(value)) return { type, id: Number(value) };
  }
  return null;
}
