// ホーム画面への追加の案内を閉じたか（端末の localStorage。設計書 4.5・8.1）
const KEY = 'kansen.installGuideDismissed';

export function createInstallGuide(local) {
  return {
    dismissed() {
      try { return local.getItem(KEY) === '1'; } catch { return false; }
    },
    dismiss() {
      try { local.setItem(KEY, '1'); } catch (e) { console.warn('案内を閉じたことを保存できませんでした', e); }
    },
  };
}
