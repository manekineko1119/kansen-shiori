// 写真の縮小（ブラウザだけ。設計書 4.2.1）。canvas に描き直すので、撮影情報（位置など）は残らない
import { PHOTO, fitSize } from '../core/photo.js';

const RETRY_QUALITY = 0.6; // 1MB を超えたときの2回目の品質

const toBlob = (canvas, quality) => new Promise((resolve, reject) => {
  canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), PHOTO.type, quality);
});

// 端末の向き（EXIF）を反映して読み、長辺 1600px の JPEG にする。1MB を超えたら品質を下げて1回だけやり直し、それでも超えたら投げる
export async function resizeToJpeg(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const { width, height } = fitSize(bitmap.width, bitmap.height, PHOTO.maxEdge);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext('2d');
    g.fillStyle = 'white'; // 透明な部分（PNG など）が黒くならないように
    g.fillRect(0, 0, width, height);
    g.drawImage(bitmap, 0, 0, width, height);
    let blob = await toBlob(canvas, PHOTO.quality);
    if (blob.size > PHOTO.maxBytes) blob = await toBlob(canvas, RETRY_QUALITY);
    if (blob.size > PHOTO.maxBytes) throw new Error('photo too large');
    return blob;
  } finally {
    bitmap.close?.();
  }
}
