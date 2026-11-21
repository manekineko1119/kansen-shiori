// 写真の縮小（ブラウザだけ。設計書 4.2.1）。canvas に描き直すので、撮影情報（位置など）は残らない
// 失敗したら、どの段階で何が起きたかを e.detail に付けて投げる（設計書 9章。画面の文は shrinkFailedMessage）
import { PHOTO, fitSize, sniffImageType } from '../core/photo.js';

const RETRY_QUALITY = 0.6; // 1MB を超えたときの2回目の品質

const toBlob = (canvas, quality) => new Promise((resolve, reject) => {
  canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), PHOTO.type, quality);
});

const failWith = (detail, cause) => Object.assign(new Error(`photo shrink failed: ${detail.step}`), { detail, cause });

// 先頭の12バイトを読んでみる。読めなければ、画像の形式ではなくファイルの読み込みの失敗
async function readHead(file) {
  try {
    return { head: sniffImageType(new Uint8Array(await file.slice(0, 12).arrayBuffer())) };
  } catch (e) {
    return { readError: e };
  }
}

async function decode(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    const base = { type: file.type, size: file.size };
    const { head, readError } = await readHead(file);
    if (readError) throw failWith({ ...base, step: 'read', error: readError.name }, readError);
    throw failWith({ ...base, step: 'decode', error: e?.name, head }, e);
  }
}

// 端末の向き（EXIF）を反映して読み、長辺 1600px の JPEG にする。1MB を超えたら品質を下げて1回だけやり直し、それでも超えたら投げる
export async function resizeToJpeg(file) {
  const bitmap = await decode(file);
  try {
    const { width, height } = fitSize(bitmap.width, bitmap.height, PHOTO.maxEdge);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext('2d');
    g.fillStyle = 'white'; // 透明な部分（PNG など）が黒くならないように
    g.fillRect(0, 0, width, height);
    g.drawImage(bitmap, 0, 0, width, height);
    let blob;
    try {
      blob = await toBlob(canvas, PHOTO.quality);
      if (blob.size > PHOTO.maxBytes) blob = await toBlob(canvas, RETRY_QUALITY);
    } catch (e) {
      throw failWith({ step: 'encode', type: file.type, size: file.size }, e);
    }
    if (blob.size > PHOTO.maxBytes) throw failWith({ step: 'tooLarge', size: blob.size });
    return blob;
  } finally {
    bitmap.close?.();
  }
}
