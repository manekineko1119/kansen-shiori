// 飛行機：スカイスキャナーの検索URLを作る（設計書 6章、FR-11a）。

const TOP = 'https://www.skyscanner.jp/';

// 'YYYY-MM-DD' → 'YYMMDD'
function yymmdd(date) {
  return date.slice(2).replaceAll('-', '');
}

/** from・to は空港コードか都市コード。to が null（最寄り空港が未登録）ならトップ（12章 No.20）。 */
export function skyscannerUrl({ from, to, outbound, inbound }) {
  if (to == null) return TOP;
  return `${TOP}transport/flights/${from.toLowerCase()}/${to.toLowerCase()}/${yymmdd(outbound)}/${yymmdd(inbound)}/`;
}
