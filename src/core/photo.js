// 観戦記録の写真の約束（設計書 4.2.1）。縮小の大きさと保存先のパス

export const PHOTO = { maxEdge: 1600, quality: 0.8, maxBytes: 1048576, type: 'image/jpeg' };

// 長辺を maxEdge に収める縮小後の大きさ（拡大はしない。端数は四捨五入、最小 1px）
export function fitSize(width, height, maxEdge = PHOTO.maxEdge) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// 縮小の失敗の理由（設計書 9章）。端末でだけ失敗する写真の原因を、画面の文から分かるようにする
const ascii = (bytes, from, to) => String.fromCharCode(...bytes.slice(from, to));

// 先頭のバイト（12バイトあれば足りる）から中身の形式を見分ける。名前・type と中身が違うことがあるため
export function sniffImageType(bytes) {
  if (bytes[0] === 0x89 && ascii(bytes, 1, 4) === 'PNG') return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (ascii(bytes, 0, 3) === 'GIF') return 'gif';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'webp';
  if (ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12);
    if (brand === 'avif' || brand === 'avis') return 'avif';
    if (['heic', 'heix', 'hevc', 'heif', 'mif1', 'msf1'].includes(brand)) return 'heic';
  }
  return '不明';
}

const STEP_LABELS = { read: 'ファイルの読み込み', decode: '画像の読み取り', encode: 'JPEG の書き出し', tooLarge: '1MB に収まらない' };

function sizeLabel(bytes) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)}MB` : `${Math.round(bytes / 1024)}KB`;
}

// detail：{ step, error（例外の name）, type（File の type）, head（sniffImageType）, size（バイト） }。どれも省ける
export function shrinkFailedMessage(detail) {
  const base = '写真を縮小できませんでした';
  if (!detail) return base;
  const parts = [];
  if (detail.step) parts.push(STEP_LABELS[detail.step] ?? detail.step);
  if (detail.error) parts.push(detail.error);
  if (detail.type !== undefined) parts.push(detail.type || '形式なし');
  if (detail.head) parts.push(`中身 ${detail.head}`);
  if (Number.isFinite(detail.size)) parts.push(sizeLabel(detail.size));
  return parts.length ? `${base}（${parts.join('・')}）` : base;
}

// Storage の保存先。1試合1枚で、自分の user_id のフォルダの下（設計書 4.2.1）。
// Storage の名前は日本語を受け付けない（400）ので、英数字・_・- 以外を含む試合ID（カップ戦の「1回戦」など）は
// UTF-8 の16進にして x- を付ける。試合IDは数字（シーズン）で始まるので、x- の名前と重ならない
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

function storageName(fixtureId) {
  if (SAFE_ID.test(fixtureId)) return fixtureId;
  const hex = [...new TextEncoder().encode(fixtureId)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `x-${hex}`;
}

export function photoPath(userId, fixtureId) {
  return `${userId}/${storageName(fixtureId)}.jpg`;
}
