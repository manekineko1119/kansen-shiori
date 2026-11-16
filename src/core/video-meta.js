// 手で貼った YouTube の動画のタイトル・チャンネル（設計書 3.4.1）。YouTube の公式の oEmbed（キー不要）の応答から取り出す純粋な関数
const OEMBED = 'https://www.youtube.com/oembed';
const YOUTUBE_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'm.youtube.com', 'youtu.be']);
const MAX_LEN = 200;

// 問い合わせの URL。YouTube の URL でなければ null（問い合わせない）
export function oembedUrl(videoUrl) {
  let u;
  try {
    u = new URL(videoUrl);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !YOUTUBE_HOSTS.has(u.host)) return null;
  return `${OEMBED}?format=json&url=${encodeURIComponent(videoUrl)}`;
}

const text = (v) => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s === '' ? null : s.slice(0, MAX_LEN);
};

// { title, channel }。チャンネルは author_url の @ハンドル（自動の取り込みと同じ形）、なければ author_name
export function videoMetaFromOembed(json) {
  const handle = /^https:\/\/www\.youtube\.com\/(@[^/?#]+)/.exec(typeof json?.author_url === 'string' ? json.author_url : '')?.[1];
  return { title: text(json?.title), channel: text(handle ?? null) ?? text(json?.author_name) };
}
