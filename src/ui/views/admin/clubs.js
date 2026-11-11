// 管理：クラブ（#/admin/clubs。設計書 3.4、FR-40・53a）。一覧＋編集。選んでいるクラブは ?id=、新規は ?new=1（D32）
import { el, split } from '../../components/parts.js';
import { bindForm } from '../../mount.js';
import { readValues, createRunner } from '../../components/form-util.js';
import { clubFromForm, clubToValues } from '../../../core/admin-form.js';
import {
  selection, mastersGuard, canEdit, backLink, ctrl, field, textField, listRow, setFlash, flashNote, dropFlashOnInput,
} from './common.js';

const BLANK = clubToValues({});

function clubForm(ctx, club) {
  const { state, key, masters } = ctx;
  const isNew = !club;
  const editable = canEdit(ctx);
  const locked = !editable;
  const v = isNew ? BLANK : clubToValues(club);
  const stadiums = masters.data.stadiums;
  const options = [['', '（未設定）'], ...stadiums.map((s) => [s.id, s.name])];
  if (v.home_stadium_id && !stadiums.some((s) => s.id === v.home_stadium_id)) options.push([v.home_stadium_id, v.home_stadium_id]);
  const area = (label, name) => field(label, name, ctrl('textarea', name, v[name], { rows: 3, disabled: locked }), name);

  const form = el('form', { class: 'sec admin-form', novalidate: true },
    backLink('#/admin/clubs', '‹ クラブの一覧'),
    el('h2', null, isNew ? 'クラブを追加' : club.name),
    textField('ID（英小文字・数字・ハイフン。あとから変えられません）', 'id', v.id, locked, { readonly: isNew ? null : true, autocapitalize: 'none' }),
    el('div', { class: 'row2' },
      textField('名前', 'name', v.name, locked),
      textField('略称（日程の取り込みの照合にも使います）', 'short_name', v.short_name, locked)),
    area('別名（1行に1つ。英語のクラブ名も。取り込み・動画の照合に使います）', 'aliases'),
    textField('公式サイトの URL', 'official_url', v.official_url, locked, { inputmode: 'url' }),
    textField('Jリーグ公式のクラブページの URL', 'jleague_url', v.jleague_url, locked, { inputmode: 'url' }),
    field('ホームスタジアム（登録済みのスタジアムから選びます）', 'home_stadium_id', ctrl('select', 'home_stadium_id', v.home_stadium_id, { options, disabled: locked }), 'home_stadium_id'),
    el('h2', null, '試合動画の取得元'),
    el('p', { class: 'muted' }, 'YouTube のチャンネルのハンドルと、動画のタイトルに含まれる言葉（1行に1つ）。空にすると、このクラブの動画は自動で登録しません。'),
    textField('チャンネルのハンドル（例：@yamagachannel）', 'video_channel', v.video_channel, locked, { autocapitalize: 'none' }),
    area('ハイライトのタイトルの言葉', 'video_kw_highlight'),
    area('INSIDE のタイトルの言葉', 'video_kw_inside'),
    el('p', { class: 'err', 'data-err': '_form', role: 'alert' }),
    flashNote('clubs', isNew ? '' : club.id),
    editable ? el('button', { class: 'btn', type: 'submit' }, isNew ? 'クラブを追加' : '変更を保存') : el('p', { class: 'muted' }, 'オフラインのため、保存できません。'));

  bindForm(form, state, key);
  dropFlashOnInput(form);
  const run = createRunner(ctx, form, 'admin-form');
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (locked) return;
    const next = clubFromForm(readValues(form), club);
    const taken = isNew && masters.data.clubs.some((c) => c.id === next.id);
    run(
      async () => (taken ? { ok: false, errors: { id: 'このIDはすでに登録されています' } } : ctx.data.admin.saveClub(next)),
      form.querySelector('button[type="submit"]'),
      async () => {
        state.clearForm(key);
        setFlash('clubs', next.id);
        await ctx.data.reloadMasters(); // 共通データを読み直す（描き直しも）
        if (isNew) ctx.navigate(`#/admin/clubs?id=${encodeURIComponent(next.id)}`);
      },
    );
  });
  return form;
}

export function renderClubs(ctx) {
  const root = el('div', { class: 'admin' }, backLink('#/admin', '‹ 管理'));
  const guard = mastersGuard(ctx);
  if (guard) { root.append(guard); return root; }
  const { masters } = ctx;
  const sel = selection(ctx.route);
  const clubs = masters.data.clubs;
  const club = sel.id ? clubs.find((c) => c.id === sel.id) : null;

  const list = el('section', { class: 'sec' },
    el('h2', null, `クラブ（${clubs.length}）`),
    clubs.map((c) => listRow({ href: `#/admin/clubs?id=${encodeURIComponent(c.id)}`, label: c.name, sub: c.short_name, selected: c.id === sel.id })),
    canEdit(ctx) ? el('a', { class: 'btn btn-sub', href: '#/admin/clubs?new=1' }, 'クラブを追加') : null);

  let detail = null;
  if (sel.isNew) detail = clubForm(ctx, null);
  else if (sel.id) {
    detail = club ? clubForm(ctx, club)
      : el('section', { class: 'sec' }, backLink('#/admin/clubs', '‹ クラブの一覧'), el('p', { class: 'muted' }, 'このクラブは登録されていません。'));
  }
  root.append(split({ list, detail }));
  return root;
}
