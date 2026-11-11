// 観戦記録の写真の約束（設計書 4.2.1）。縮小の大きさと保存先のパス

export const PHOTO = { maxEdge: 1600, quality: 0.8, maxBytes: 1048576, type: 'image/jpeg' };

// 長辺を maxEdge に収める縮小後の大きさ（拡大はしない。端数は四捨五入、最小 1px）
export function fitSize(width, height, maxEdge = PHOTO.maxEdge) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// Storage の保存先。1試合1枚で、自分の user_id のフォルダの下
export function photoPath(userId, fixtureId) {
  return `${userId}/${fixtureId}.jpg`;
}
