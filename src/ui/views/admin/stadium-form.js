// 管理：スタジアムの編集フォーム（設計書 3.4・4.1、FR-41・44）。駅・東横イン・空港の行の数と並びは、入力欄の値（view-state）に持つ
// 行の増減・並べ替えは、値を書き換えて作り直す（入力中の値も行の数も残る。段6 の約束）
import { el } from '../../components/parts.js';
import { bindForm } from '../../mount.js';
import { readValues, createRunner } from '../../components/form-util.js';
import {
  stadiumFromForm, stadiumToValues, stationRows, airportRows, replaceRows, moveItem, mapStadiumErrors, toyokoHotelFromInput,
} from '../../../core/admin-form.js';
import { parseAgodaArea } from '../../../core/links/agoda.js';
import { TOYOKO_PREFECTURE_CODES } from '../../../core/links/toyoko-inn.js';
import { canEdit, backLink, ctrl, field, textField, setFlash, flashNote, dropFlashOnInput } from './common.js';

const KINDS = [['nearest', '最寄り駅'], ['shuttle', 'シャトルバスの発着駅'], ['bus', '路線バスの発着駅']];
const MAX_TOYOKO = 3;
const blankStation = () => ({ name: '', kind: 'nearest', walk_min: '', note: '', toyoko: [] });
const blankToyoko = () => ({ url: '', name: '', walk_min: '' });
const blankAirport = () => ({ iata: '', name: '', station: '', access_min: '', note: '' });
const blankValues = () => replaceRows({
  id: '', name: '', prefecture: '', address: '', lat: '', lng: '', access_url: '', shuttle_note: '', parking_note: '', agoda_url: '', agoda_name: '', verified_at: '',
}, { stations: [blankStation()], airports: [] });

const hotelHint = (text) => {
  if (text.trim() === '') return '';
  const id = toyokoHotelFromInput(text);
  return id ? `店の番号：${id}` : '店の番号を読み取れません。…/search/detail/12345/ の形の URL を貼ってください';
};
const agodaHint = (text) => {
  if (text.trim() === '') return 'Agoda の地域は登録しません（トップを開きます）';
  const a = parseAgodaArea(text.trim());
  return a ? `地域：${a.type} ${a.id}` : '地域を読み取れません。region= か city= の入った URL を貼ってください';
};

// 貼り付けた URL の読み取り結果を、入力欄の下に出す（入力のたびに更新）
function withHint(fieldEl, input, makeHint) {
  const hint = el('p', { class: 'hint', 'data-hint': '' });
  const update = () => { hint.textContent = makeHint(input.value); };
  input.addEventListener('input', update);
  update();
  input.after(hint);
  return fieldEl;
}

export function stadiumForm(ctx, stadium) {
  const { state, key, masters } = ctx;
  const isNew = !stadium;
  const editable = canEdit(ctx);
  const locked = !editable;
  // 最終確認日は、保存する日を最初から入れる（手で変えられる。前の日付は見出しに出す）
  const base = isNew ? blankValues() : { ...stadiumToValues(stadium), verified_at: ctx.today };
  const saved = state.getForm(key);
  const v = Object.keys(saved).length ? saved : base;
  const stations = stationRows(v);
  const airports = airportRows(v);

  const text = (label, name, attrs) => textField(label, name, v[name], locked, attrs);
  const area = (label, name) => field(label, name, ctrl('textarea', name, v[name], { rows: 3, disabled: locked }), name);
  const act = (label, onclick, disabled = false) => el('button', { class: 'btn btn-sub btn-small', type: 'button', disabled: disabled || null, onclick }, label);
  const num = (label, name, value, ...errs) => field(label, name, ctrl('input', name, value, { type: 'text', inputmode: 'numeric', autocomplete: 'off', disabled: locked }), ...errs);
  const plain = (label, name, value, ...errs) => field(label, name, ctrl('input', name, value, { type: 'text', autocomplete: 'off', disabled: locked }), ...errs);

  // 行の増減・並べ替え：今の入力を読み、行を書き換えて覚え直し、作り直す
  function mutate(fn) {
    const values = readValues(form);
    state.setForm(key, replaceRows(values, fn({ stations: stationRows(values), airports: airportRows(values) })));
    ctx.redraw();
  }

  function toyokoBlock(i, j, h) {
    const n = (f) => `station_${i}_toyoko_${j}_${f}`;
    const url = ctrl('input', n('url'), h.url, { type: 'text', inputmode: 'url', autocomplete: 'off', disabled: locked });
    return el('fieldset', { class: 'airrow' },
      el('legend', null, `近くの東横イン ${j + 1}`),
      withHint(field('ホテルのページの URL（貼ると店の番号を読み取ります）', n('url'), url, `stations.${i}.toyoko.${j}.hotel`), url, hotelHint),
      el('div', { class: 'row2' },
        plain('店名', n('name'), h.name),
        num('駅から徒歩（分）', n('walk_min'), h.walk_min, `stations.${i}.toyoko.${j}.walk_min`)),
      editable ? act(`東横イン ${j + 1} を削除`, () => mutate(({ stations: s }) => { s[i].toyoko.splice(j, 1); return { stations: s }; })) : null);
  }

  function stationBlock(i, st) {
    const n = (f) => `station_${i}_${f}`;
    return el('fieldset', { class: 'airrow' },
      el('legend', null, `駅 ${i + 1}${i === 0 ? '（乗換検索の到着駅）' : ''}`),
      el('div', { class: 'row2' },
        plain('駅名', n('name'), st.name, `stations.${i}.name`),
        field('種類', n('kind'), ctrl('select', n('kind'), st.kind, { options: KINDS, disabled: locked }), `stations.${i}.kind`)),
      el('div', { class: 'row2' },
        num('駅から徒歩（分。空でも可）', n('walk_min'), st.walk_min, `stations.${i}.walk_min`),
        plain('メモ', n('note'), st.note)),
      el('p', { class: 'err', 'data-err': `stations.${i}.toyoko` }),
      st.toyoko.map((h, j) => toyokoBlock(i, j, h)),
      editable ? el('div', { class: 'row-actions' },
        act('↑ 上へ', () => mutate(({ stations: s }) => ({ stations: moveItem(s, i, i - 1) })), i === 0),
        act('↓ 下へ', () => mutate(({ stations: s }) => ({ stations: moveItem(s, i, i + 1) })), i === stations.length - 1),
        act('＋ 近くの東横インを追加', () => mutate(({ stations: s }) => { s[i].toyoko.push(blankToyoko()); return { stations: s }; }), st.toyoko.length >= MAX_TOYOKO),
        act(`駅 ${i + 1} を削除`, () => mutate(({ stations: s }) => { s.splice(i, 1); return { stations: s }; }))) : null);
  }

  function airportBlock(i, a) {
    const n = (f) => `airport_${i}_${f}`;
    return el('fieldset', { class: 'airrow' },
      el('legend', null, `空港 ${i + 1}`),
      el('div', { class: 'row2' },
        field('空港コード（OKA など）', n('iata'), ctrl('input', n('iata'), a.iata, { type: 'text', autocomplete: 'off', autocapitalize: 'characters', disabled: locked }), `airports.${i}.iata`),
        num('スタジアムまで（分）', n('access_min'), a.access_min, `airports.${i}.access_min`)),
      plain('空港の名前', n('name'), a.name),
      plain('空港の駅（乗換案内の出発駅。ないときは空）', n('station'), a.station),
      plain('メモ', n('note'), a.note),
      editable ? act(`空港 ${i + 1} を削除`, () => mutate(({ airports: ap }) => { ap.splice(i, 1); return { airports: ap }; })) : null);
  }

  const prefectures = Object.keys(TOYOKO_PREFECTURE_CODES);
  if (v.prefecture && !prefectures.includes(v.prefecture)) prefectures.push(v.prefecture);
  const agodaInput = ctrl('input', 'agoda_url', v.agoda_url, { type: 'text', inputmode: 'url', autocomplete: 'off', disabled: locked });

  const form = el('form', { class: 'sec admin-form', novalidate: true },
    backLink('#/admin/stadiums', '‹ スタジアムの一覧'),
    el('h2', null, isNew ? 'スタジアムを追加' : stadium.name),
    el('div', { class: 'row2' },
      text('ID（英小文字・数字・ハイフン。あとから変えられません）', 'id', { readonly: isNew ? null : true, autocapitalize: 'none' }),
      field('都道府県', 'prefecture', ctrl('select', 'prefecture', v.prefecture, { options: [['', '選んでください'], ...prefectures.map((p) => [p, p])], disabled: locked }), 'prefecture')),
    text('スタジアム名', 'name'),
    text('住所', 'address'),
    el('div', { class: 'row2' }, text('緯度', 'lat', { inputmode: 'decimal' }), text('経度', 'lng', { inputmode: 'decimal' })),
    el('h2', null, '駅'),
    el('p', { class: 'muted' }, '先頭の駅が、乗換案内の到着駅になります。シャトルバスがあれば、その発着駅を先頭にします。'),
    stations.map((st, i) => stationBlock(i, st)),
    editable ? act('＋ 駅を追加', () => mutate(({ stations: s }) => ({ stations: [...s, blankStation()] }))) : null,
    el('h2', null, '最寄り空港'),
    airports.map((a, i) => airportBlock(i, a)),
    editable ? act('＋ 空港を追加', () => mutate(({ airports: ap }) => ({ airports: [...ap, blankAirport()] }))) : null,
    el('h2', null, 'そのほか'),
    text('公式のアクセス案内の URL', 'access_url', { inputmode: 'url' }),
    area('シャトルバスのメモ', 'shuttle_note'),
    area('駐車場のメモ', 'parking_note'),
    withHint(field('Agoda の検索結果の URL（貼ると地域を読み取ります）', 'agoda_url', agodaInput, 'agoda_url'), agodaInput, agodaHint),
    text('Agoda の地域の名前（メモ。空でも可）', 'agoda_name'),
    text(isNew ? '最終確認日（空なら保存した日）' : `最終確認日（前回：${stadium.verified_at ?? '未確認'}。保存した日を入れてあります）`, 'verified_at', { placeholder: 'YYYY-MM-DD' }),
    el('p', { class: 'err', 'data-err': '_form', role: 'alert' }),
    flashNote('stadiums', isNew ? '' : stadium.id),
    editable ? el('button', { class: 'btn', type: 'submit' }, isNew ? 'スタジアムを追加' : '変更を保存') : el('p', { class: 'muted' }, 'オフラインのため、保存できません。'));

  bindForm(form, state, key);
  dropFlashOnInput(form);
  const run = createRunner(ctx, form, 'admin-form');
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (locked) return;
    const values = readValues(form);
    const next = stadiumFromForm(values, ctx.today);
    const taken = isNew && masters.data.stadiums.some((s) => s.id === next.id);
    run(
      async () => (taken ? { ok: false, errors: { id: 'このIDはすでに登録されています' } } : ctx.data.admin.saveStadium(next)),
      form.querySelector('button[type="submit"]'),
      async () => {
        state.clearForm(key);
        setFlash('stadiums', next.id);
        await ctx.data.reloadMasters(); // 共通データを読み直す（結果画面の乗換の到着駅なども変わる）
        if (isNew) ctx.navigate(`#/admin/stadiums?id=${encodeURIComponent(next.id)}`);
      },
      (errors) => mapStadiumErrors(errors, values),
    );
  });
  return form;
}
