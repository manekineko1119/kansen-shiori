// 行ったスタジアムの地図（#/map。地図の spec 4章）。DOM を作るだけ。集計は src/core/stadium-map.js
import { el, section } from '../components/parts.js';
import { renderJapanMap } from '../components/japan-map.js';
import { bindErrors, createRunner, readValues } from '../components/form-util.js';
import { summarizeStadiumMap, parseMapQuery, mapHref } from '../../core/stadium-map.js';
import { seasonLabel } from '../../core/record-list.js';
import { opponentOf } from '../../core/fixture-view.js';
import { formatDateJa } from '../../core/format.js';
import { JAPAN_SHAPE } from '../../core/map/japan-shape.js';

const CONFIRM_DELETE = 'この行った会場の記録を削除しますか';
const enc = encodeURIComponent;
const note = (text) => el('p', { class: 'note', role: 'status' }, text);

// シーズンの id の一覧（読めないときは今のシーズンだけ。読めないときに限り、URL のシーズンが一覧にないなら足す）
function seasonIds({ scope, seasons, currentId }) {
  const ids = Array.isArray(seasons) ? seasons.map((s) => s.id) : [currentId].filter(Boolean);
  if (!Array.isArray(seasons) && scope !== 'all' && !ids.includes(scope)) ids.push(scope);
  return ids;
}

function controls(ctx, { scope, seasons, currentId }) {
  const list = seasonIds({ scope, seasons, currentId });
  return el('div', { class: 'map-controls' },
    el('select', { class: 'input', name: 'season', 'aria-label': '通算かシーズン', onchange: (e) => ctx.navigate(mapHref({ season: e.target.value || null })) },
      el('option', { value: '', selected: scope === 'all' }, '通算'),
      list.map((id) => el('option', { value: id, selected: id === scope }, seasonLabel(id)))));
}

function figures(totals, loading) {
  if (loading) return el('p', { class: 'muted' }, '読み込み中…');
  const fig = (label, value, all) => el('div', null, el('span', null, label), el('b', { class: 'fig num' }, all === null ? String(value) : `${value}／${all}`));
  return el('div', { class: 'map-figs' }, fig('行った会場', totals.visited, totals.all), fig('都道府県', totals.prefVisited, totals.prefAll));
}

// 行ったことのある会場の表
function visitsTable(ctx, { visited, fixturesById, supportClubId }) {
  const sec = section('行ったことのある会場');
  sec.classList.add('map-visits');
  sec.append(el('p', { class: 'err', 'data-err': '_form', role: 'alert' }));
  const errs = bindErrors(ctx, sec, 'visit-del', () => (sec.isConnected ? sec : document.querySelector('.map-visits')));
  if (visited.length === 0) { sec.append(el('p', { class: 'muted' }, 'まだありません')); return sec; }

  const remove = async (id, button) => {
    if (!window.confirm(CONFIRM_DELETE)) return;
    errs.clear();
    button.disabled = true;
    let res;
    try { res = await ctx.data.visits.remove(id); } finally { button.disabled = false; }
    if (res === 'expired') { ctx.onExpired(); return; }
    if (!res.ok) { errs.show(res.errors); return; }
    await ctx.data.reloadPersonal();
  };
  const matchLink = (id) => {
    const f = fixturesById.get(id);
    if (!f) return null;
    return el('a', { class: 'vr-match num', href: `#/records/${enc(id)}` }, `${formatDateJa(f.match_date)} vs ${opponentOf(f, supportClubId, ctx.masters.clubsById).short_name}`);
  };
  sec.append(el('div', { class: 'map-rows' }, visited.map(({ stadium, count, fixtureIds, visits }) => {
    const dates = (id) => fixturesById.get(id)?.match_date ?? '';
    const matches = [...fixtureIds].sort((a, b) => (dates(a) < dates(b) ? 1 : dates(a) > dates(b) ? -1 : 0));
    return el('div', { class: 'map-row', id: `v-${stadium.id}`, tabindex: '-1' },
      el('div', { class: 'vr-head' }, el('b', null, stadium.name), el('span', { class: 'muted' }, stadium.prefecture ?? ''), el('span', { class: 'num vr-count' }, `${count}回`)),
      matches.map(matchLink),
      visits.map((v) => el('div', { class: 'vr-hand' },
        el('span', { class: 'muted' }, `手で足した記録：${v.season_id ? seasonLabel(v.season_id) : 'シーズンなし'}`),
        el('button', { class: 'btn btn-sub btn-small', type: 'button', 'aria-label': `${stadium.name}の手で足した記録を削除`, onclick: (e) => remove(v.id, e.currentTarget) }, '削除'))));
  })));
  return sec;
}

function unplacedList(ctx, { unplaced, fixturesById, supportClubId }) {
  if (unplaced.length === 0) return null;
  return section('地図に出せない観戦', el('div', { class: 'map-rows' }, unplaced.map(({ fixtureId, venueName }) => {
    const f = fixturesById.get(fixtureId);
    const opp = f ? opponentOf(f, supportClubId, ctx.masters.clubsById).short_name : '';
    return el('a', { class: 'map-row vr-un', href: `#/records/${enc(fixtureId)}` },
      el('span', { class: 'num' }, f ? `${formatDateJa(f.match_date)} vs ${opp}` : fixtureId), el('span', { class: 'muted' }, venueName || '会場不明'));
  })));
}

// 会場の選択肢：都道府県（JIS の番号順）ごとの optgroup
function stadiumOptions(stadiums) {
  const order = new Map(JAPAN_SHAPE.prefectures.map((p) => [p.name, p.code]));
  const groups = new Map();
  for (const s of stadiums) {
    const k = order.has(s.prefecture) ? s.prefecture : 'その他';
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const rank = (k) => order.get(k) ?? 99;
  return [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([k, list]) =>
    el('optgroup', { label: k }, list.map((s) => el('option', { value: s.id }, s.name))));
}

function addForm(ctx, { stadiums, seasons, scope, currentId }) {
  const formKey = `${ctx.key}|visit-add`;
  const saved = ctx.state.getForm(formKey);
  const ids = seasonIds({ scope, seasons, currentId });
  const stadiumVal = saved.stadium_id ?? '';
  const seasonVal = saved.season_id ?? (scope === 'all' ? '' : scope);
  const form = el('form', { class: 'visit-form', novalidate: true },
    el('div', { class: 'field' }, el('label', { for: 'va-stadium' }, '会場'),
      el('select', { class: 'input', id: 'va-stadium', name: 'stadium_id' }, el('option', { value: '' }, '会場を選ぶ'), stadiumOptions(stadiums)),
      el('p', { class: 'err', 'data-err': 'stadium_id' })),
    el('div', { class: 'field' }, el('label', { for: 'va-season' }, 'シーズン（任意）'),
      el('select', { class: 'input', id: 'va-season', name: 'season_id' }, el('option', { value: '' }, 'なし'), ids.map((id) => el('option', { value: id }, seasonLabel(id))))),
    el('p', { class: 'err', 'data-err': '_form', role: 'alert' }));
  form.elements.stadium_id.value = stadiumVal;
  form.elements.season_id.value = seasonVal;
  const button = el('button', { class: 'btn', type: 'submit' }, '追加');
  form.append(button);
  form.addEventListener('change', () => ctx.state.setForm(formKey, readValues(form)));
  const run = createRunner(ctx, form, 'visit-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const values = readValues(form);
    return run(() => ctx.data.visits.add({ stadium_id: values.stadium_id, season_id: values.season_id || null }), button, async () => {
      ctx.state.clearForm(formKey);
      await ctx.data.reloadPersonal();
    });
  });
  return section('行った会場を追加', form);
}

// 地図の一覧で選んだ会場へ：行った会場は表のその行へ、行っていない会場は追加の欄の会場にする
function pickStadium(stadium, count) {
  if (count > 0) {
    const row = document.getElementById(`v-${stadium.id}`);
    row?.scrollIntoView({ block: 'center' });
    row?.focus({ preventScroll: true });
    return;
  }
  const select = document.getElementById('va-stadium');
  if (!select) return;
  select.value = stadium.id;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  select.scrollIntoView({ block: 'center' });
  select.focus({ preventScroll: true });
}

export function renderMap(ctx) {
  const root = el('div', { class: 'map-screen' });
  const { masters, personal } = ctx;
  if (masters.status === 'loading') { root.append(el('p', { class: 'muted' }, '読み込み中です。')); return root; }
  if (masters.status === 'unavailable') { root.append(note(masters.message)); return root; }
  if (masters.status === 'offline') root.append(note(masters.label));
  const d = masters.data;

  // 未ログイン：全会場の薄い印と、ログインの案内だけ
  if (!ctx.user) {
    const s = summarizeStadiumMap({ scope: 'all', records: [], fixtures: [], clubs: d.clubs, stadiums: d.stadiums, visits: [], seasonClubs: null, supportClubId: null });
    root.append(el('div', { class: 'map-grid map-public' }, el('div', { class: 'map-a' }, renderJapanMap({ visitedPrefectures: [], pins: [], baseStadiums: d.stadiums.filter((x) => s.baseIds.includes(x.id)), onPick: null })),
      el('section', { class: 'sec map-b' }, el('p', null, 'ログインすると、行った会場を記録できます。'),
        el('a', { class: 'btn', href: '#/login', onclick: (e) => { e.preventDefault(); ctx.data.goLogin(); } }, 'ログイン'))));
    return root;
  }
  if (!personal || personal.status === 'loading') { root.append(el('p', { class: 'muted' }, '読み込み中です。')); return root; }
  if (personal.status === 'unavailable') { root.append(note(personal.message)); return root; }
  if (personal.status === 'offline') root.append(note(personal.label));

  const currentId = d.season?.id ?? null;
  const online = masters.status !== 'offline' && !ctx.user.offline;
  const seasons = online ? ctx.data.seasons() : null;
  const wanted = parseMapQuery(ctx.route.query).season ?? 'all';
  // シーズンの一覧が読めているのに、一覧にない ?s= の値は通算として扱う
  const scope = Array.isArray(seasons) && wanted !== 'all' && !seasons.some((x) => x.id === wanted) ? 'all' : wanted;
  const supportClubId = ctx.settings?.support_club_id ?? null;

  // シーズンの分母のための所属クラブ。今のシーズンは共通データ、ほかは読み込む（undefined＝読み込み中、null＝読めない）
  let seasonClubs = null;
  if (scope === 'all') seasonClubs = null;
  else if (scope === currentId) seasonClubs = d.seasonClubs;
  else if (online) seasonClubs = ctx.data.seasonClubs(scope);
  const loadingBase = scope !== 'all' && seasonClubs === undefined;

  const fixtures = [...d.fixtures, ...(personal.data.extraFixtures ?? [])];
  const fixturesById = new Map(fixtures.map((f) => [f.id, f]));
  const s = summarizeStadiumMap({
    scope, records: personal.data.records, fixtures, clubs: d.clubs, stadiums: d.stadiums, visits: personal.data.visits,
    seasonClubs: seasonClubs ?? null, supportClubId,
  });
  const baseSet = new Set(s.baseIds ?? []);
  const map = renderJapanMap({
    visitedPrefectures: s.prefectures,
    pins: s.visited.map((e) => ({ stadium: e.stadium, count: e.count })),
    baseStadiums: d.stadiums.filter((x) => baseSet.has(x.id)),
    onPick: pickStadium,
  });

  root.append(el('div', { class: 'map-grid' },
    el('div', { class: 'map-c' }, controls(ctx, { scope, seasons, currentId })),
    el('div', { class: 'map-n' }, figures(s.totals, loadingBase)),
    el('div', { class: 'map-a' }, map),
    el('div', { class: 'map-b' },
      visitsTable(ctx, { visited: s.visited, fixturesById, supportClubId }),
      unplacedList(ctx, { unplaced: s.unplaced, fixturesById, supportClubId }),
      addForm(ctx, { stadiums: d.stadiums, seasons, scope, currentId }))));
  return root;
}
