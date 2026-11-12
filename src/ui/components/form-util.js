// フォームの共通の小道具（観戦記録の2つのフォームで使う）。この画面から src/data/ は読まない

// 入力欄の今の値（チェックは true/false、ラジオは選んでいるものだけ）
export function readValues(form) {
  const values = {};
  for (const f of form.elements) {
    if (!f.name || f.type === 'file') continue;
    if (f.type === 'checkbox') values[f.name] = f.checked;
    else if (f.type === 'radio') { if (f.checked) values[f.name] = f.value; } else values[f.name] = f.value;
  }
  return values;
}

const fill = (root, errors) => {
  for (const [k, msg] of Object.entries(errors ?? {})) {
    const b = root?.querySelector(`[data-err="${k}"]`) ?? root?.querySelector('[data-err="_form"]');
    if (b) b.textContent = msg;
  }
};
const wipe = (root) => { for (const p of root?.querySelectorAll('[data-err]') ?? []) p.textContent = ''; };

// 保存の失敗の理由（[data-err] の文）を view-state に覚える。フォームを作るとき出し直し、入力すると消す（開閉・回転で消えない。M-6）
// live()：今の画面のフォーム（作り直されたあとの出し先）。show/clear はそこに書く
export function bindErrors(ctx, form, formKey, live = () => form) {
  const k = `${ctx.key}|${formKey}`;
  fill(form, ctx.state.getErrors(k));
  form.addEventListener('input', () => { ctx.state.clearErrors(k); wipe(form); });
  return {
    show(errors) { ctx.state.setErrors(k, errors); fill(live(), errors); },
    clear() { ctx.state.clearErrors(k); wipe(live()); },
  };
}

// 保存の実行：実行中は2回押せない。'expired' は ctx.onExpired()、失敗は理由を出す（覚える）、成功は onOk。
// 幅が変わって画面が作り直されても、今の画面に理由を出す（form が外れていたら、同じ class の今のフォームを探す）
export function createRunner(ctx, form, formClass) {
  const errors = bindErrors(ctx, form, formClass, () => (form.isConnected ? form : document.querySelector(`form.${formClass}`)));

  return async function run(action, button, onOk, mapErrors = (e) => e) {
    errors.clear();
    button.disabled = true;
    let res;
    try {
      res = await action();
    } finally {
      button.disabled = false;
    }
    if (res === 'expired') { ctx.onExpired(); return; }
    if (!res.ok) { errors.show(mapErrors(res.errors)); return; }
    await onOk(res);
  };
}
