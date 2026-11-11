// 管理：テスター（#/admin/testers。設計書 3.4・7.1、FR-33、D36）。許可リストの一覧＋追加（?new=1）
// アカウントの有無は admin_allowed_emails() で読む（管理者でなければ関数が拒否する）。メールアドレスは console に出さない
import { el, split } from '../../components/parts.js';
import { bindForm } from '../../mount.js';
import { readValues, createRunner } from '../../components/form-util.js';
import { selection, canEdit, backLink, ctrl, field, loadGuard, dateTimeText } from './common.js';

const REMOVE_GUIDE = '許可リストから外しても、作られたアカウントは残ります。使えなくするときは、アカウントも Supabase の Authentication → Users で削除してください。';

// 一覧の上に出す1回のお知らせ（削除・追加のあと。作り直しをまたいで、次の操作まで出す）
let notice = null; // { kind: 'note' | 'err', text }

function testerRow(ctx, t, editable) {
  const added = dateTimeText(t.created_at).split(' ')[0];
  const remove = editable ? el('button', { class: 'btn btn-sub btn-small btn-danger', type: 'button' }, '削除') : null;
  remove?.addEventListener('click', async () => {
    if (!window.confirm(`${t.email} を許可リストから削除します。${t.has_account ? `\n${REMOVE_GUIDE}` : ''}\nよろしいですか？`)) return;
    remove.disabled = true;
    const res = await ctx.data.admin.removeTester(t.email);
    remove.disabled = false;
    if (res === 'expired') { ctx.onExpired(); return; }
    notice = res.ok
      ? { kind: 'note', text: t.has_account ? `削除しました。${REMOVE_GUIDE}` : '削除しました。' }
      : { kind: 'err', text: res.errors._form };
    ctx.data.adminCache.reset('testers');
    ctx.redraw();
  });
  return el('div', { class: 'row tester-row' },
    el('span', { class: 'row-main' },
      el('span', { class: 'row-label tester-email' }, t.email),
      el('span', { class: 'row-sub muted' }, [t.note, `追加 ${added}`].filter(Boolean).join('　'))),
    el('span', { class: `acct ${t.has_account ? 'acct-yes' : 'acct-no'}` }, t.has_account ? 'ログイン済み' : 'まだログインしていない'),
    remove);
}

function addForm(ctx) {
  const { state, key } = ctx;
  const form = el('form', { class: 'sec admin-form tester-form', novalidate: true },
    backLink('#/admin/testers', '‹ テスターの一覧'),
    el('h2', null, 'テスターを追加'),
    el('p', { class: 'muted' }, 'テスターの Google アカウントのメールアドレスを入れます。テスターはアプリで「Googleでログイン」を押すだけで使えます（Google Cloud のテストユーザーにも足してください）。'),
    field('メールアドレス', 'email', ctrl('input', 'email', '', { type: 'email', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', inputmode: 'email' }), 'email'),
    field('メモ（誰か分かるように）', 'note', ctrl('input', 'note', '', { type: 'text', autocomplete: 'off' }), 'note'),
    el('p', { class: 'err', 'data-err': '_form', role: 'alert' }),
    el('button', { class: 'btn', type: 'submit' }, '追加'));
  bindForm(form, state, key); // 開閉・回転で入力を残す
  const run = createRunner(ctx, form, 'tester-form');
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const values = readValues(form);
    run(() => ctx.data.admin.addTester({ email: values.email, note: values.note }), form.querySelector('button[type="submit"]'), () => {
      state.clearForm(key);
      notice = { kind: 'note', text: '追加しました。' };
      ctx.data.adminCache.reset('testers');
      ctx.navigate('#/admin/testers');
    });
  });
  form.addEventListener('input', () => { notice = null; });
  return form;
}

export function renderTesters(ctx) {
  const root = el('div', { class: 'admin' }, backLink('#/admin', '‹ 管理'));
  const editable = canEdit(ctx);
  const sel = selection(ctx.route);
  const res = ctx.data.adminCache.testers();
  const guard = loadGuard(ctx, res);

  const list = el('section', { class: 'sec' },
    el('h2', null, guard ? 'テスター' : `テスター（${res.testers.length}）`),
    notice ? el('p', { class: notice.kind === 'err' ? 'err' : 'note', role: 'status' }, notice.text) : null,
    guard ?? (res.testers.length
      ? res.testers.map((t) => testerRow(ctx, t, editable))
      : el('p', { class: 'muted' }, 'まだ誰も招待していません。')),
    editable ? el('a', { class: 'btn btn-sub', href: '#/admin/testers?new=1' }, 'テスターを追加') : el('p', { class: 'muted' }, 'オフラインのため、追加・削除はできません。'),
    el('p', { class: 'hint' }, REMOVE_GUIDE));

  const detail = sel.isNew && editable ? addForm(ctx) : null;
  root.append(split({ list, detail }));
  return root;
}
