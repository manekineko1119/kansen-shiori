// 名前の表記ゆれをそろえる関数（日程の取り込み・Jリーグ公式の照合・動画の判定で共用。設計書 5.5）。
// Edge Function と Node のテストの両方から読むため、通信をしない純粋な関数だけを置く。

// 全角の英数字・記号（U+FF01〜FF5E）と全角空白（U+3000）を半角にする
export function toHalfWidth(s) {
  return String(s ?? '')
    .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ');
}

// 照合用の名前：半角にそろえ、小文字にし、空白をすべて取り除く
export function normalizeName(s) {
  return toHalfWidth(s).toLowerCase().replace(/\s+/g, '');
}
