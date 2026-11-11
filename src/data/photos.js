// 観戦記録の写真の Storage（record-photos。設計書 4.2.1・9章）。user_id は呼び出し側が渡す（自分のフォルダだけ。守りは Storage の RLS）
import { photoPath, PHOTO } from '../core/photo.js';
import { toFormError } from './errors.js';

const BUCKET = 'record-photos';
const SIGNED_SECONDS = 3600;
const KEEP_MS = (SIGNED_SECONDS - 300) * 1000; // 期限の5分前までは同じ URL を使う
export const PHOTO_UPLOAD_FAILED = '写真をアップロードできませんでした';

export function createPhotoStore({ client, userId, now = Date.now }) {
  const urls = new Map(); // パス → { url, until }（描き直すたびに通信しないため）
  const bucket = () => client.storage.from(BUCKET);

  return {
    // 同じパスに上書きする（差し替えで古いファイルが残らない）。期限切れは 'expired'
    async upload(fixtureId, blob) {
      const path = photoPath(userId, fixtureId);
      try {
        const { error } = await bucket().upload(path, blob, { upsert: true, contentType: PHOTO.type });
        if (error) return toFormError(error) === 'expired' ? 'expired' : { ok: false, errors: { photo: PHOTO_UPLOAD_FAILED } };
        urls.delete(path);
        return { ok: true, path };
      } catch {
        return { ok: false, errors: { photo: PHOTO_UPLOAD_FAILED } };
      }
    },
    // 失敗しても投げない（記録の削除を止めないため）
    async remove(path) {
      urls.delete(path);
      try {
        const { error } = await bucket().remove([path]);
        return error ? { ok: false } : { ok: true };
      } catch {
        return { ok: false };
      }
    },
    // 表示用の署名付き URL。取れなければ null（失敗は覚えない）
    async signedUrl(path) {
      const hit = urls.get(path);
      if (hit && hit.until > now()) return hit.url;
      try {
        const { data, error } = await bucket().createSignedUrl(path, SIGNED_SECONDS);
        const url = error ? null : (data?.signedUrl ?? null);
        if (url) urls.set(path, { url, until: now() + KEEP_MS });
        return url;
      } catch {
        return null;
      }
    },
  };
}
