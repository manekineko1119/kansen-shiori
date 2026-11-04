// Yahoo!乗換案内の検索結果ページのURLを作る（設計書 6章）。非公式の形式。
// 1桁の月日・時はそのまま渡す（m=3 でも m=03 でも開くことを確認済み）。
// 時刻なしの日付だけの指定は日付が無視されるため、時刻が未定のときは9:00出発で指定する。

/**
 * @param {{ from: string, to: string, date: string, arriveTime: string|null }} cond
 *   date は 'YYYY-MM-DD'、arriveTime は 'HH:MM'（キックオフ未定なら null）
 * @returns {string}
 */
export function yahooTransitUrl({ from, to, date, arriveTime }) {
  const [y, m, d] = date.split('-').map(Number);
  const params = new URLSearchParams({ from, to, y: String(y), m: String(m), d: String(d) });
  if (arriveTime === null) {
    params.set('hh', '9');
    params.set('m1', '0');
    params.set('m2', '0');
  } else {
    const [hh, mm] = arriveTime.split(':').map(Number);
    params.set('hh', String(hh));
    params.set('m1', String(Math.floor(mm / 10)));
    params.set('m2', String(mm % 10));
    params.set('type', '4'); // 到着時刻指定
  }
  return `https://transit.yahoo.co.jp/search/result?${params}`;
}
