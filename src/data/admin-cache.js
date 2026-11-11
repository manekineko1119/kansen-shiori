// 管理画面の読み取り（テスター・取り込みの状況・写真の使用量）と「今すぐ取り込む」の実行中の状態をメモリに覚える（設計書 3.4）
// 画面は描き直すたびに作り直すので、読み込み・実行中の状態はここに持つ（DOM に持たせない）
// testers()・syncStatus(day)・photoUsage()：undefined＝読み込み中、それ以外は admin.js の読み取りの結果。読み終わると onChange()
export function createAdminCache({ store, onChange }) {
  const values = new Map(); // 名前 → 結果
  const pending = new Map(); // 名前 → 読み込みの印（reset のあとに返ってきた古い結果を捨てるため）
  let syncDay = null; // 覚えている取り込みの状況の日（日本時間の 0 時の ISO）
  let run = { running: false, outcome: null }; // 「今すぐ取り込む」：実行中か、最後の結果

  function get(name, load) {
    if (values.has(name)) return values.get(name);
    if (!pending.has(name)) {
      const token = {};
      pending.set(name, token);
      load().then((v) => v, () => ({ ok: false, message: '読み込めませんでした。通信できる場所で開き直してください' })).then((v) => {
        if (pending.get(name) !== token) return; // 途中で reset された古い結果は捨てる
        pending.delete(name);
        values.set(name, v);
        onChange();
      });
    }
    return undefined;
  }

  function reset(name) {
    for (const n of name ? [name] : [...values.keys(), ...pending.keys()]) { values.delete(n); pending.delete(n); }
  }

  return {
    testers: () => get('testers', () => store().loadTesters()),
    syncStatus(dayStartIso) {
      if (syncDay !== dayStartIso) { reset('sync'); syncDay = dayStartIso; }
      return get('sync', () => store().loadSyncStatus(dayStartIso));
    },
    photoUsage: () => get('photos', () => store().loadPhotoUsage()),
    // 追加・削除・取り込みのあと、管理のメニューを開いたときに読み直す
    reset,

    run: () => run,
    // 実行中なら null（呼ばない）。結果が返ったら取り込みの状況を読み直す。戻り値は store の結果のまま（'expired' を含む）
    async runNow(clubId) {
      if (run.running) return null;
      run = { running: true, outcome: null };
      onChange();
      let res;
      try {
        res = await store().runSyncNow(clubId);
      } finally {
        // 期限切れ（'expired'）は覚えない。画面に出す結果ではなく、呼んだ側が ctx.onExpired() に渡す
        run = { running: false, outcome: res && res !== 'expired' ? res : null };
        reset('sync');
        onChange();
      }
      return res;
    },
  };
}
