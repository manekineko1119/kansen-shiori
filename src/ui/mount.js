// 入力欄と view-state のつなぎ、画面の作り直し（設計書 3.5、NFR-15）

const fieldsOf = (el) => [...el.querySelectorAll('input, select, textarea')]
  .filter((f) => f.type !== 'file' && (f.name || f.id));

const nameOf = (f) => f.name || f.id;

function read(el) {
  const values = {};
  for (const f of fieldsOf(el)) {
    if (f.type === 'checkbox') values[nameOf(f)] = f.checked;
    else if (f.type === 'radio') { if (f.checked) values[nameOf(f)] = f.value; }
    else values[nameOf(f)] = f.value;
  }
  return values;
}

// 作るときに覚えていた値を入れ、入力のたびに覚え直す
export function bindForm(formEl, state, key) {
  const saved = state.getForm(key);
  for (const f of fieldsOf(formEl)) {
    const v = saved[nameOf(f)];
    if (v === undefined) continue;
    if (f.type === 'checkbox') f.checked = v === true;
    else if (f.type === 'radio') f.checked = f.value === v;
    else f.value = v;
  }
  const save = () => state.setForm(key, { ...state.getForm(key), ...read(formEl) });
  formEl.addEventListener('input', save);
  formEl.addEventListener('change', save);
}

// 今のスクロール位置を覚え、画面を作り直し、次の描画で位置を戻す
export function rerender(state, key, renderFn) {
  state.setScroll(key, window.scrollY);
  renderFn();
  requestAnimationFrame(() => window.scrollTo(0, state.getScroll(key)));
}
