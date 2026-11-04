// 宿：東横イン公式サイトの検索URLを作る（設計書 6章・6.1、FR-13）。

// 都道府県名 → JISコード
export const TOYOKO_PREFECTURE_CODES = {
  北海道: 1, 青森県: 2, 岩手県: 3, 宮城県: 4, 秋田県: 5, 山形県: 6, 福島県: 7,
  茨城県: 8, 栃木県: 9, 群馬県: 10, 埼玉県: 11, 千葉県: 12, 東京都: 13, 神奈川県: 14,
  新潟県: 15, 富山県: 16, 石川県: 17, 福井県: 18, 山梨県: 19, 長野県: 20,
  岐阜県: 21, 静岡県: 22, 愛知県: 23, 三重県: 24,
  滋賀県: 25, 京都府: 26, 大阪府: 27, 兵庫県: 28, 奈良県: 29, 和歌山県: 30,
  鳥取県: 31, 島根県: 32, 岡山県: 33, 広島県: 34, 山口県: 35,
  徳島県: 36, 香川県: 37, 愛媛県: 38, 高知県: 39,
  福岡県: 40, 佐賀県: 41, 長崎県: 42, 熊本県: 43, 大分県: 44, 宮崎県: 45, 鹿児島県: 46, 沖縄県: 47,
};

const BASE = 'https://www.toyoko-inn.com/search/result/';
const CONDITIONS = 'people=1&room=1&smoking=noSmoking';

/** hotel は5桁のホテルID。日付は 'YYYY-MM-DD'。 */
export function toyokoHotelUrl({ hotel, checkIn, checkOut }) {
  return `${BASE}room_plan/?hotel=${hotel}&${CONDITIONS}&start=${checkIn}&end=${checkOut}`;
}

/** 表にない県なら null。 */
export function toyokoPrefectureUrl({ prefecture, checkIn, checkOut }) {
  const code = TOYOKO_PREFECTURE_CODES[prefecture];
  if (code === undefined) return null;
  return `${BASE}?prefecture=${code}&${CONDITIONS}&start=${checkIn}&end=${checkOut}`;
}

/** 東横インの店舗ページのURLから5桁のホテルIDを読む。読めなければ null。 */
export function parseToyokoHotelId(url) {
  const m = /^https?:\/\/(?:www\.)?toyoko-inn\.com\/(?:eng\/)?search\/detail\/(\d{5})\/?(?:[?#].*)?$/.exec(url);
  return m ? m[1] : null;
}

/** 駅の順に店を並べる。同じ店は最初の駅だけ。 */
export function toyokoHotelsForStations(stations) {
  const seen = new Set();
  const result = [];
  for (const st of stations) {
    for (const h of st.toyoko ?? []) {
      if (seen.has(h.hotel)) continue;
      seen.add(h.hotel);
      result.push({ hotel: h.hotel, name: h.name, walk_min: h.walk_min, station: st.name, kind: st.kind });
    }
  }
  return result;
}
