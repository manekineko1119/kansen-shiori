// 手で貼った動画のタイトル・チャンネルを YouTube の oEmbed から読む（設計書 3.4.1・11.6）。読めなければ両方 null
import { oembedUrl, videoMetaFromOembed } from '../core/video-meta.js';

const TIMEOUT_MS = 5000;

export async function fetchVideoMeta(videoUrl) {
  const url = oembedUrl(videoUrl);
  if (!url) return { title: null, channel: null };
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), credentials: 'omit' });
  if (!res.ok) return { title: null, channel: null };
  return videoMetaFromOembed(await res.json());
}
