// 初回の設定（#/welcome。設計書 7.3、FR-34）：応援クラブ・出発駅と都道府県・出発空港（任意）
import { bindForm } from '../mount.js';

// settings：5-7 の load の settings（全項目）。clubs：共通データのクラブ（なければ今の値だけ出す）。
// onSave(values) は保存の結果 { ok, errors } を返す。保存では全項目を送る（5-7 の約束）
export function renderWelcome({ settings, clubs, state, key, onSave }) {
  const form = document.createElement('form');
  form.className = 'sec';
  form.noValidate = true;
  form.innerHTML = `<h2>はじめの設定</h2>
    <p class="muted">あとから設定画面で変えられます。</p>
    <div class="field"><label for="w-club">応援クラブ</label><select id="w-club" name="support_club_id" class="input"></select></div>
    <div class="field"><label for="w-station">出発駅</label><input id="w-station" name="origin_station" class="input" type="text" autocomplete="off"><p class="err" data-err="origin_station"></p></div>
    <div class="field"><label for="w-pref">出発地の都道府県</label><input id="w-pref" name="origin_prefecture" class="input" type="text" autocomplete="off"><p class="err" data-err="origin_prefecture"></p></div>
    <fieldset class="field"><legend class="muted">出発空港（任意。飛行機で行くときに使う）</legend></fieldset>
    <p class="err" data-err="_form" role="alert"></p>
    <button type="submit" class="btn">保存して始める</button>`;

  const select = form.querySelector('select');
  const list = clubs?.length ? clubs : [{ id: settings.support_club_id, name: settings.support_club_id }];
  for (const c of list) select.append(new Option(c.name, c.id, false, c.id === settings.support_club_id));
  form.querySelector('[name="origin_station"]').value = settings.origin_station;
  form.querySelector('[name="origin_prefecture"]').value = settings.origin_prefecture;

  const fs = form.querySelector('fieldset');
  settings.origin_airports.forEach((a, i) => {
    const label = document.createElement('label');
    label.className = 'check';
    label.innerHTML = `<input type="checkbox" name="airport_${i}" checked><span></span>`;
    label.querySelector('span').textContent = `${a.name}（${a.code}）`;
    fs.append(label);
  });

  bindForm(form, state, key); // 開閉・回転で入力を残す（段6 の約束）

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    for (const p of form.querySelectorAll('[data-err]')) p.textContent = '';
    const values = {
      ...settings,
      support_club_id: select.value,
      origin_station: form.querySelector('[name="origin_station"]').value.trim(),
      origin_prefecture: form.querySelector('[name="origin_prefecture"]').value.trim(),
      origin_airports: settings.origin_airports.filter((_, i) => form.querySelector(`[name="airport_${i}"]`).checked),
    };
    const local = {};
    if (!values.origin_station) local.origin_station = '出発駅を入力してください';
    if (!values.origin_prefecture) local.origin_prefecture = '都道府県を入力してください';
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; // 保存中は2回押せない
    let res;
    try {
      res = Object.keys(local).length ? { ok: false, errors: local } : await onSave(values);
    } finally {
      btn.disabled = false;
    }
    if (res.ok) return;
    for (const [k, msg] of Object.entries(res.errors ?? {})) {
      const p = form.querySelector(`[data-err="${k}"]`) ?? form.querySelector('[data-err="_form"]');
      p.textContent = msg;
    }
  });
  return form;
}
