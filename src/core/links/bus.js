// 高速バス：バス比較なびの検索URLを作る（設計書 6章、FR-12）。
import { addDays } from '../time.js';

// 都道府県名 → バス比較なびの出発地・到着地の選択肢の値（2026-11-04 に実際の選択肢で確認）。
// 選択肢にある「北海道・道央」などの地域分け（hokkaido*）と沖縄（okinawa）は、
// 都道府県と1対1に決められない・陸路のバスがないため入れない（表にない県は欄を出さない）。
export const BUS_PREFECTURE_SLUGS = {
  青森県: 'aomori', 岩手県: 'iwate', 秋田県: 'akita', 宮城県: 'miyagi', 山形県: 'yamagata', 福島県: 'fukushima',
  東京都: 'tokyo', 千葉県: 'chiba', 神奈川県: 'kanagawa', 埼玉県: 'saitama', 群馬県: 'gunma', 茨城県: 'ibaraki', 栃木県: 'tochigi',
  長野県: 'nagano', 山梨県: 'yamanashi', 新潟県: 'niigata', 石川県: 'ishikawa', 福井県: 'fukui', 富山県: 'toyama',
  愛知県: 'aichi', 静岡県: 'shizuoka', 岐阜県: 'gifu', 三重県: 'mie',
  大阪府: 'osaka', 京都府: 'kyoto', 兵庫県: 'hyogo', 滋賀県: 'shiga', 和歌山県: 'wakayama', 奈良県: 'nara',
  岡山県: 'okayama', 広島県: 'hiroshima', 島根県: 'shimane', 鳥取県: 'tottori', 山口県: 'yamaguchi',
  愛媛県: 'ehime', 徳島県: 'tokushima', 香川県: 'kagawa', 高知県: 'kochi',
  福岡県: 'fukuoka', 佐賀県: 'saga', 長崎県: 'nagasaki', 大分県: 'oita', 熊本県: 'kumamoto', 宮崎県: 'miyazaki', 鹿児島県: 'kagoshima',
};

/** date は 'YYYY-MM-DD'。表にない県なら null。 */
export function busSearchUrl({ fromPrefecture, toPrefecture, date }) {
  const from = BUS_PREFECTURE_SLUGS[fromPrefecture];
  const to = BUS_PREFECTURE_SLUGS[toPrefecture];
  if (!from || !to) return null;
  return `https://www.bushikaku.net/search/${from}_${to}/${date.replaceAll('-', '')}/`;
}

/** 行き（当日）・行き（前日夜発）・帰り（当日）。表にない県なら null。 */
export function busLinks({ fromPrefecture, toPrefecture, matchDate }) {
  const outbound = busSearchUrl({ fromPrefecture, toPrefecture, date: matchDate });
  if (outbound === null) return null;
  return {
    outbound,
    outboundNight: busSearchUrl({ fromPrefecture, toPrefecture, date: addDays(matchDate, -1) }),
    inbound: busSearchUrl({ fromPrefecture: toPrefecture, toPrefecture: fromPrefecture, date: matchDate }),
  };
}
