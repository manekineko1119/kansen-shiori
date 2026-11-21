import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHOTO, fitSize, photoPath, sniffImageType, shrinkFailedMessage } from '../src/core/photo.js';

test('PHOTO：縮小の約束の値', () => {
  assert.deepEqual(PHOTO, { maxEdge: 1600, quality: 0.8, maxBytes: 1048576, type: 'image/jpeg' });
});

test('fitSize：長辺を1600pxに縮める。端数は四捨五入', () => {
  assert.deepEqual(fitSize(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(fitSize(1200, 1600), { width: 1200, height: 1600 });
  assert.deepEqual(fitSize(3000, 4001), { width: 1200, height: 1600 });
});

test('fitSize：小さい画像は拡大しない。長辺の指定もできる', () => {
  assert.deepEqual(fitSize(800, 600), { width: 800, height: 600 });
  assert.deepEqual(fitSize(1600, 1600), { width: 1600, height: 1600 });
  assert.deepEqual(fitSize(4000, 2000, 1000), { width: 1000, height: 500 });
});

test('fitSize：細長い画像でも1px未満にならない', () => {
  assert.deepEqual(fitSize(16000, 1), { width: 1600, height: 1 });
});

test('photoPath：{user_id}/{試合ID}.jpg', () => {
  assert.equal(photoPath('u1', '2026-27_J3_12_gifu_matsumoto'), 'u1/2026-27_J3_12_gifu_matsumoto.jpg');
});

test('photoPath：英数字・_・- 以外を含む試合ID（カップ戦の「1回戦」）は、UTF-8 の16進にして x- を付ける（Storage は日本語の名前を受け付けない）', () => {
  const p = photoPath('u1', '2026-27_LEVAIN_1回戦_matsumoto_shonan');
  assert.equal(p, `u1/x-${Buffer.from('2026-27_LEVAIN_1回戦_matsumoto_shonan', 'utf8').toString('hex')}.jpg`);
  assert.match(p, /^[A-Za-z0-9_\-/.]+$/);
  // 試合IDが違えば名前も違う
  assert.notEqual(photoPath('u1', '2026-27_LEVAIN_2回戦_matsumoto_niigata'), p);
});

test('sniffImageType：先頭のバイトから中身の形式を見分ける', () => {
  const b = (...xs) => Uint8Array.from(xs);
  const ascii = (s, pad = 4) => [...new Array(pad).fill(0), ...[...s].map((c) => c.charCodeAt(0))];
  assert.equal(sniffImageType(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), 'png');
  assert.equal(sniffImageType(b(0xff, 0xd8, 0xff, 0xe1)), 'jpeg');
  assert.equal(sniffImageType(b(...[...'GIF89a'].map((c) => c.charCodeAt(0)))), 'gif');
  assert.equal(sniffImageType(b(...[...'RIFF'].map((c) => c.charCodeAt(0)), 0, 0, 0, 0, ...[...'WEBP'].map((c) => c.charCodeAt(0)))), 'webp');
  assert.equal(sniffImageType(b(...ascii('ftypheic'))), 'heic');
  assert.equal(sniffImageType(b(...ascii('ftypmif1'))), 'heic');
  assert.equal(sniffImageType(b(...ascii('ftypavif'))), 'avif');
  assert.equal(sniffImageType(b(1, 2, 3)), '不明');
  assert.equal(sniffImageType(b()), '不明');
});

test('shrinkFailedMessage：理由がなければ今までの文のまま', () => {
  assert.equal(shrinkFailedMessage(), '写真を縮小できませんでした');
  assert.equal(shrinkFailedMessage(null), '写真を縮小できませんでした');
});

test('shrinkFailedMessage：段階・エラーの種類・ファイルの形式・中身・大きさを括弧に並べる', () => {
  assert.equal(
    shrinkFailedMessage({ step: 'decode', error: 'InvalidStateError', type: 'image/png', head: 'png', size: 2130869 }),
    '写真を縮小できませんでした（画像の読み取り・InvalidStateError・image/png・中身 png・2.0MB）',
  );
  assert.equal(
    shrinkFailedMessage({ step: 'read', error: 'NotReadableError', type: '', size: 512000 }),
    '写真を縮小できませんでした（ファイルの読み込み・NotReadableError・形式なし・500KB）',
  );
  assert.equal(shrinkFailedMessage({ step: 'encode' }), '写真を縮小できませんでした（JPEG の書き出し）');
  assert.equal(shrinkFailedMessage({ step: 'tooLarge', size: 1200000 }), '写真を縮小できませんでした（1MB に収まらない・1.1MB）');
});
