// 検索（#/search。設計書 3.1、FR-01〜08・16）：記録をつける案内 → きっぷ → 条件 → 検索 → 検索履歴
// 入力はすべて name を付け、bindForm で開閉・回転でも残す。データ層は ctx から使う（D29）
import { el, innerLink } from '../components/parts.js';
import { renderTicket } from '../components/ticket.js';
import { bindForm } from '../mount.js';
import { nextAwayFixture, recordPromptFixture } from '../../core/fixtures.js';
import { opponentOf } from '../../core/fixture-view.js';
import {
  searchDefaults, queryFromForm, historyLabel, fixtureLabel, upcomingFixtures, ticketInfo, opponentGroups, MODE_NAMES, LODGING_NAMES,
} from '../../core/search-form.js';

const ERR_KEYS = ['fixtureId', 'opponentId', 'date', 'kickoff', 'modes'];

// 選択肢（チップ）。input を隠して、隣の span を丸い枠で見せる（キーボードの操作もそのまま使える）
function chip(type, name, value, label, checked) {
  return el('label', { class: 'chip' }, el('input', { type, name, value, checked }), el('span', null, label));
}

function field(label, id, node, errName) {
  return el('div', { class: 'field' }, el('label', { for: id }, label), node, errName ? el('p', { class: 'err', 'data-err': errName }) : null);
}

function buildOptions(select, first, rows) {
  select.append(new Option(first, ''));
  for (const [value, label] of rows) select.append(new Option(label, value));
}

export function renderSearch(ctx) {
  const { settings, masters, state, key } = ctx;
  const data = masters.data;
  const fixtures = data?.fixtures ?? [];
  const supportClubId = settings.support_club_id;
  const labelEnv = { clubsById: masters.clubsById, supportClubId };
  const defaults = searchDefaults(settings);

  const notices = [];
  if (masters.status === 'unavailable') notices.push(masters.message);
  else if (masters.status === 'offline') notices.push(masters.label);
  const root = el('div', { class: 'search' }, notices.map((t) => el('p', { class: 'note', role: 'status' }, t)));

  // 記録をつける案内
  const prompt = data ? recordPromptFixture(fixtures, supportClubId, ctx.nowMs) : null;
  if (prompt) {
    const opp = opponentOf(prompt, supportClubId, masters.clubsById).short_name;
    root.append(el('div', { class: 'prompt' }, innerLink({ href: `#/records/${prompt.id}`, label: `${opp}戦の記録をつける` })));
  }

  // ---- 条件の入力 ----
  const fixtureSelect = el('select', { id: 'sf-fixtureId', name: 'fixtureId', class: 'input' });
  buildOptions(fixtureSelect, '試合を選んでください',
    upcomingFixtures(fixtures, supportClubId, ctx.today).map((f) => [f.id, fixtureLabel(f, labelEnv)]));
  const opponentSelect = el('select', { id: 'sf-opponentId', name: 'opponentId', class: 'input' });
  // 応援クラブと同じ大会を先頭に、大会ごとにまとめる（カップ戦でほかの大会のクラブとも当たるため）
  opponentSelect.append(new Option('指定しない', ''));
  for (const g of opponentGroups({ clubs: data?.clubs, seasonClubs: data?.seasonClubs, supportClubId })) {
    opponentSelect.append(el('optgroup', { label: g.label }, g.clubs.map((c) => new Option(c.name, c.id))));
  }

  const fixtureBlock = el('div', { 'data-kind': 'fixture' }, field('日程から選ぶ', 'sf-fixtureId', fixtureSelect, 'fixtureId'));
  const customBlock = el('div', { 'data-kind': 'custom' },
    field('対戦相手', 'sf-opponentId', opponentSelect, 'opponentId'),
    el('div', { class: 'row2' },
      field('日付', 'sf-date', el('input', { id: 'sf-date', name: 'date', class: 'input', type: 'date' }), 'date'),
      field('キックオフ（任意）', 'sf-kickoff', el('input', { id: 'sf-kickoff', name: 'kickoff', class: 'input', type: 'time' }), 'kickoff')),
    field('会場を直接入力（任意）', 'sf-venue', el('input', { id: 'sf-venue', name: 'venue', class: 'input', type: 'text', autocomplete: 'off' })));

  const origin = `設定：${settings.origin_station}駅（${settings.origin_prefecture}）`;
  const form = el('form', { class: 'search-form', novalidate: true },
    el('h2', null, '試合'),
    el('div', { class: 'sec', 'data-cond': '' },
      el('div', { class: 'seg' }, chip('radio', 'kind', 'fixture', '日程から選ぶ', true), chip('radio', 'kind', 'custom', '手入力', false)),
      fixtureBlock, customBlock),
    el('h2', null, '交通手段'),
    el('div', { class: 'seg' }, Object.entries(MODE_NAMES).map(([m, label]) => chip('checkbox', `mode_${m}`, m, label, defaults.modes.includes(m)))),
    el('p', { class: 'err', 'data-err': 'modes' }),
    el('h2', null, '宿泊'),
    el('div', { class: 'seg' }, Object.entries(LODGING_NAMES).map(([l, label]) => chip('radio', 'lodging', l, label, l === defaults.lodging))),
    el('h2', null, '出発地'),
    el('div', { class: 'seg' }, chip('radio', 'origin', 'settings', origin, true), chip('radio', 'origin', 'here', '現在地から', false)),
    el('div', { class: 'cta' }, el('button', { class: 'btn btn-wide', type: 'submit' }, 'この条件で検索')));

  // 種類の切り替え（入力欄を作り直さず、見せる・隠すだけ）
  const sync = () => {
    const kind = form.querySelector('[name="kind"]:checked')?.value ?? 'fixture';
    for (const b of form.querySelectorAll('[data-kind]')) b.hidden = b.dataset.kind !== kind;
  };
  bindForm(form, state, key);
  sync();
  form.addEventListener('change', sync);

  const read = () => ({
    kind: form.querySelector('[name="kind"]:checked')?.value ?? 'fixture',
    fixtureId: form.elements.fixtureId.value,
    opponentId: form.elements.opponentId.value,
    date: form.elements.date.value,
    kickoff: form.elements.kickoff.value,
    venue: form.elements.venue.value,
    modes: Object.keys(MODE_NAMES).filter((m) => form.elements[`mode_${m}`].checked),
    lodging: form.querySelector('[name="lodging"]:checked')?.value ?? 'none',
    origin: form.querySelector('[name="origin"]:checked')?.value ?? 'settings',
  });

  const go = (qs) => {
    ctx.data.history.push(qs);
    ctx.navigate(`#/result?${qs}`);
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    for (const k of ERR_KEYS) form.querySelector(`[data-err="${k}"]`).textContent = '';
    const r = queryFromForm(read());
    if (!r.ok) {
      for (const [k, msg] of Object.entries(r.errors)) form.querySelector(`[data-err="${k}"]`).textContent = msg;
      form.querySelector('.err:not(:empty)')?.scrollIntoView({ block: 'center' });
      return;
    }
    go(r.qs);
  });

  // ---- きっぷ ----
  const next = data ? nextAwayFixture(fixtures, supportClubId, ctx.nowMs) : null;
  if (next) {
    const info = ticketInfo(next, { clubsById: masters.clubsById, stadiumsById: masters.stadiumsById, supportClubId, originStation: settings.origin_station, today: ctx.today });
    // 条件の「日程から選ぶ」に試合を入れる（入力は bindForm が覚える）
    const pick = () => {
      const kind = form.querySelector('[name="kind"][value="fixture"]');
      kind.checked = true;
      form.elements.fixtureId.value = next.id;
      form.dispatchEvent(new Event('change', { bubbles: true }));
      form.querySelector('[data-cond]').scrollIntoView({ block: 'start', behavior: 'smooth' });
    };
    const search = () => {
      const r = queryFromForm({ ...defaults, fixtureId: next.id });
      if (r.ok) go(r.qs);
      else pick(); // 設定の交通手段が空など、そのまま検索できないときは条件に入れる
    };
    root.append(renderTicket({ fixture: info, from: info.from, to: info.to, kickoff: info.kickoff, days: info.days, onSearch: search, onPick: pick }));
  } else {
    root.append(el('p', { class: 'note', 'data-empty-ticket': '' }, data ? '次のアウェイ戦は登録されていません' : '日程を読み込み中です'));
  }

  root.append(form);

  // ---- 検索履歴 ----
  // 1件ずつ消せる（確認なし。設計書 3.1・4.5）。削除のボタンは再検索のリンクの外に置き、押し間違えを防ぐ
  const history = ctx.data.history.list();
  if (history.length > 0) {
    root.append(el('h2', null, '最近の検索'), el('div', { class: 'sec hist' },
      history.map((qs) => {
        const label = historyLabel(qs, { fixturesById: masters.fixturesById, clubsById: masters.clubsById, supportClubId });
        return el('div', { class: 'hist-row' },
          el('a', { href: `#/result?${qs}`, onclick: () => ctx.data.history.push(qs) },
            el('span', null, label),
            el('span', { class: 'muted' }, '再検索')),
          el('button', { class: 'hist-del', type: 'button', 'aria-label': `「${label}」の履歴を削除`, onclick: () => { ctx.data.history.remove(qs); ctx.redraw(); } }, '削除'));
      })));
  }
  return root;
}
