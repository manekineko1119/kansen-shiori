// 日程（#/fixtures。設計書 3章・3.5、FR-20・22・57）：応援クラブの試合の一覧と、選んだ試合（?f=<試合ID>）の詳細
// 一覧と詳細は両方作り、S で一覧を隠すのは CSS だけ（D31）。選んだ試合は URL が持つ（D32）
import { el, innerLink, outcomeBadge, split } from '../components/parts.js';
import { fixtureRows, nearestIndex } from '../../core/fixture-list.js';
import { fixtureSide, opponentOf, venueOf, competitionLabel, statusLabel } from '../../core/fixture-view.js';
import { formatDateJa } from '../../core/format.js';
import { formatScore, matchOutcome } from '../../core/result.js';
import { buildResultQuery } from '../../core/search-query.js';

// 今日に近い行まで1回だけスクロールした画面（作り直しで位置を奪わない）
const autoScrolled = new Set();

const selectedId = (route) => new URLSearchParams(route.query ?? '').get('f');

function listRow(r, selected) {
  const detailHref = `#/fixtures?f=${encodeURIComponent(r.id)}`;
  return el('div', { class: `item${r.id === selected ? ' sel' : ''}${r.mark ? ' off' : ''}`, 'data-fixture': r.id },
    el('a', { class: 'item-main', href: detailHref, 'aria-current': r.id === selected ? 'true' : null },
      el('span', { class: 'date num' }, el('b', null, formatDateJa(r.date)), r.kickoffText),
      el('span', { class: `ha ${r.side.toLowerCase()}` }, r.side),
      el('span', { class: 't' }, el('b', null, `vs ${r.opponent}`), r.mark ? el('span', { class: 'mark' }, r.mark) : null)),
    r.outcome ? el('span', { class: 'res-wrap' }, outcomeBadge(r.outcome), el('span', { class: 'num score' }, r.score)) : null,
    r.finished ? el('a', { class: 'item-rec', href: `#/records/${encodeURIComponent(r.id)}` }, '観戦記録 ›') : null);
}

function detail(f, ctx) {
  const { masters, settings } = ctx;
  const club = settings.support_club_id;
  const side = fixtureSide(f, club);
  const name = (id) => masters.clubsById[id]?.name ?? id;
  const venue = venueOf(f, masters);
  const outcome = matchOutcome(f, club);
  const score = formatScore(f, club);
  const status = statusLabel(f);
  const query = buildResultQuery({ fixtureId: f.id, modes: settings.default_modes, lodging: 'none', origin: 'settings' });
  return el('section', { class: 'sec fx-detail' },
    el('a', { class: 'back', href: '#/fixtures' }, '‹ 日程の一覧'),
    el('p', { class: 'muted' }, `${competitionLabel(f)}　${side === 'A' ? 'アウェイ' : 'ホーム'}`),
    el('h2', { class: 'fx-title' }, `${name(f.home_club_id)} vs ${name(f.away_club_id)}`),
    el('dl', { class: 'kv' },
      el('dt', null, '日時'), el('dd', { class: 'num' }, `${formatDateJa(f.match_date)} ${f.kickoff ?? 'キックオフ時刻未定'}`),
      el('dt', null, '会場'), el('dd', null, venue.name),
      status ? [el('dt', null, '状態'), el('dd', null, status)] : null,
      score ? [el('dt', null, '結果'), el('dd', { class: 'fx-result' }, outcomeBadge(outcome), el('span', { class: 'num' }, `${score}（${opponentOf(f, club, masters.clubsById).short_name}戦）`))] : null),
    innerLink({ href: `#/result?${query}`, label: 'この試合で検索', sub: '乗換・高速バス・宿・飲食店など' }),
    f.status === 'finished' ? innerLink({ href: `#/records/${encodeURIComponent(f.id)}`, label: '観戦記録' }) : null);
}

function missing() {
  return el('section', { class: 'sec fx-detail' },
    el('a', { class: 'back', href: '#/fixtures' }, '‹ 日程の一覧'),
    el('p', { class: 'muted' }, '試合の情報が見つかりません。'));
}

export function renderFixtures(ctx) {
  const { masters, settings, route, state, key } = ctx;
  const rows = fixtureRows(masters.data?.fixtures, { supportClubId: settings.support_club_id, clubsById: masters.clubsById });
  const selected = selectedId(route);
  const root = el('div', { class: 'fixtures' });

  if (masters.status === 'unavailable') root.append(el('p', { class: 'note', role: 'status' }, masters.message));
  else if (masters.status === 'offline') root.append(el('p', { class: 'note', role: 'status' }, masters.label));

  const list = rows.length === 0
    ? el('section', { class: 'sec' }, el('p', { class: 'muted' }, masters.status === 'loading' ? '読み込み中です。' : '日程はまだ登録されていません'))
    : el('div', { class: 'sec list' }, rows.map((r) => listRow(r, selected)));

  let detailNode = null;
  if (selected) {
    const f = masters.fixturesById[selected];
    detailNode = f && fixtureSide(f, settings.support_club_id) ? detail(f, ctx) : missing();
  }
  root.append(split({ list, detail: detailNode }));

  // 今日に近い行まで（スクロール位置が記録されていない最初の1回だけ）
  const idx = nearestIndex(rows, ctx.today);
  if (!selected && idx > 0 && !state.getScroll(key) && !autoScrolled.has(key)) {
    autoScrolled.add(key);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (state.getScroll(key)) return;
      root.querySelector(`[data-fixture="${CSS.escape(rows[idx].id)}"]`)?.scrollIntoView({ block: 'center' });
    }));
  }
  return root;
}
