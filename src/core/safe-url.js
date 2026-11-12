// リンクにしてよい URL か（設計書 11.6）。https で、ユーザー名・パスワードを含まないものだけを返す。ほかは null
// DB・入力の URL を href に入れる前に必ず通す（javascript: などを通さない）
export function safeHttpsUrl(url) {
  if (typeof url !== 'string' || url === '') return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return null; // 相対パス・壊れた URL
  }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  return url;
}
