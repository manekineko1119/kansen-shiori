// 画面の上に出すお知らせ1件の持ち方（設計書 3.5）。DOM は使わない
export const RELOAD_FAILED_NOTICE = '共通データを読み直せませんでした（通信できません）。保存した内容は反映されています。画面を開き直すと最新になります';

// set(text, survive)：survive 回の遷移まで消さない（保存のあとの遷移で、出す前に消えないように）。
// onNavigate(routeName)：遷移のたび。survive が残っていれば減らすだけ。なければ、検索画面以外へ移ったとき消す（ログアウト直後の画面だけ出すため）
export function createNotice() {
  let text = null;
  let survive = 0;
  return {
    get text() { return text; },
    set(t, keep = 0) { text = t; survive = keep; },
    onNavigate(routeName) {
      if (!text) return;
      if (survive > 0) survive -= 1;
      else if (routeName !== 'search') text = null;
    },
  };
}
