// 保存の失敗の理由を1つにまとめる（設計書 9章、D34）。画面は { _form } を [data-err="_form"] に出す。'expired' は ctx.onExpired() に渡す
export const FORM_MESSAGES = {
  forbidden: '権限がありません',
  invalid: '入力の値を保存できませんでした',
  offline: '保存できませんでした。通信できる場所でもう一度保存してください',
  expired: 'ログインの有効期限が切れました。もう一度ログインしてください',
  deleteOffline: '削除できませんでした。通信できる場所でもう一度削除してください',
  deleteInvalid: '削除できませんでした',
};

const EXPIRED_CODES = ['PGRST301', 'PGRST303'];

// Supabase の error オブジェクト、または投げられた例外 → { _form } | 'expired'。削除のときは action に 'delete'（文を「削除できませんでした」にする。7-6）
export function toFormError(e, action = 'save') {
  const del = action === 'delete';
  const code = typeof e?.code === 'string' ? e.code : '';
  if (EXPIRED_CODES.includes(code) || e?.status === 401) return 'expired';
  if (code === '42501') return { _form: FORM_MESSAGES.forbidden };
  if (/^2[23]/.test(code)) return { _form: del ? FORM_MESSAGES.deleteInvalid : FORM_MESSAGES.invalid };
  return { _form: del ? FORM_MESSAGES.deleteOffline : FORM_MESSAGES.offline };
}
