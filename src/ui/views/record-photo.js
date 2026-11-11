// 観戦記録の写真の表示と入力（設計書 4.2.1・9章、FR-55）。Storage は ctx.data.photos（なければ出さない）
import { el } from '../components/parts.js';
import { resizeToJpeg } from '../photo-resize.js';

// 署名付き URL で <img>。取れなければ「写真を表示できません」（オフラインなど）
export function photoView(ctx, path) {
  const box = el('figure', { class: 'rec-photo' }, el('p', { class: 'muted' }, '写真を読み込み中…'));
  const fail = () => box.replaceChildren(el('p', { class: 'muted', role: 'status' }, '写真を表示できません'));
  const photos = ctx.data.photos;
  if (!photos) { fail(); return box; }
  photos.signedUrl(path).then((url) => {
    if (!url) { fail(); return; }
    const img = el('img', { src: url, alt: '試合の写真' });
    img.addEventListener('error', fail);
    box.replaceChildren(img);
  }, fail);
  return box;
}

/**
 * 記録の編集フォームの写真の欄。オフライン・未ログイン（ctx.data.photos なし）は null
 * 選んだファイルは画面のメモリに持つ（開閉・回転で消えたら選び直し）
 * 戻り値：node、makeBlob（選んでいなければ null。縮小は保存のときに行う）、fail(message, onRetry)（写真だけ失敗したとき「もう一度アップロード」を出す）
 */
export function renderPhotoField(ctx, { record, onRemove, retry: failed = null, onFile = () => {} }) {
  if (!ctx.data.photos || ctx.user?.offline) return null;
  let file = failed?.file ?? null;
  const input = el('input', { id: 'r-photo', class: 'input', type: 'file', accept: 'image/*' });
  const name = el('p', { class: 'muted', 'data-photo-name': '' });
  const err = el('p', { class: 'err', 'data-err': 'photo' });
  const retry = el('button', { class: 'btn btn-sub btn-small', type: 'button', hidden: true }, '写真をもう一度アップロード');
  const showName = () => {
    name.textContent = file ? `${file.name}（保存すると${record?.photo_path ? '差し替わります' : '追加されます'}）` : '';
  };
  showName();
  input.addEventListener('change', () => {
    file = input.files?.[0] ?? null;
    showName();
    err.textContent = '';
    onFile(file);
  });
  const remove = record?.photo_path
    ? el('button', { class: 'btn btn-sub btn-danger btn-small', type: 'button', onclick: onRemove }, '写真を削除')
    : null;

  const node = el('div', { class: 'field photo-field' },
    el('label', { for: 'r-photo' }, '写真（1枚）'),
    record?.photo_path ? photoView(ctx, record.photo_path) : null,
    input, name, err, retry, remove);
  const api = {
    node,
    get makeBlob() { return file ? () => resizeToJpeg(file) : null; },
    get file() { return file; },
    removeButton: remove,
    retryButton: retry,
    showFailed: (onRetry) => { if (failed) api.fail(failed.message, onRetry); },
    fail(message, onRetry) {
      err.textContent = message;
      retry.hidden = false;
      retry.onclick = onRetry;
    },
  };
  return api;
}
