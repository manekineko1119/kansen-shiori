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

// 保存の実行：実行中は2回押せない。'expired' は ctx.onExpired()、失敗は理由を出す、成功は onOk。
// 幅が変わって画面が作り直されても、今の画面に理由を出す（form が外れていたら、同じ class の今のフォームを探す）
export function createRunner(ctx, form, formClass) {
  const live = () => (form.isConnected ? form : document.querySelector(`form.${formClass}`));
  const errBox = (name) => live()?.querySelector(`[data-err="${name}"]`) ?? live()?.querySelector('[data-err="_form"]');
  const clearErrors = () => { for (const p of live()?.querySelectorAll('[data-err]') ?? []) p.textContent = ''; };
  const showErrors = (errors) => { for (const [k, msg] of Object.entries(errors)) { const b = errBox(k); if (b) b.textContent = msg; } };

  return async function run(action, button, onOk, mapErrors = (e) => e) {
    clearErrors();
    button.disabled = true;
    let res;
    try {
      res = await action();
    } finally {
      button.disabled = false;
    }
    if (res === 'expired') { ctx.onExpired(); return; }
    if (!res.ok) { showErrors(mapErrors(res.errors)); return; }
    await onOk(res);
  };
}
