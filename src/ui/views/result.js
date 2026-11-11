// 結果（#/result?<条件>。設計書 3.2、FR-09〜15・23）：時刻の流れ → スタジアム → 経路 → 高速バス → 飛行機 → 宿泊 → そのほか → 遠征予定
// 中身は buildResultPage（src/core）が共通データの写しだけで作るので、通信しない（NFR-10）
import { el, section, extLink, innerLink } from '../components/parts.js';
import { renderTimeline } from '../components/timeline.js';
import { renderFlight } from './result-flight.js';
import { routeKey } from '../view-state.js';
import { buildResultPage } from '../../core/result-page.js';
import { parseResultQuery } from '../../core/search-query.js';
import { historyLabel, formFromQuery, MODE_NAMES, LODGING_NAMES } from '../../core/search-form.js';
import { formatDateJa } from '../../core/format.js';
import { addDays } from '../../core/time.js';

const STATION_KINDS = { nearest: '最寄り駅', shuttle: 'シャトルバスの出発駅', bus: '路線バスの発着駅' };
const SEARCH_ROUTE = { name: 'search', params: {}, query: '' };

function kv(rows) {
  const items = rows.filter(([, v]) => v);
  return el('dl', { class: 'kv' }, items.map(([k, v]) => [el('dt', null, k), el('dd', null, v)]));
}

function timeline(page) {
  const { arrive, kickoff, end } = page.timeline;
  const cap = [el('b', null, formatDateJa(page.summary.date)), `　${page.summary.title}`];
  return renderTimeline({
    cap,
    items: arrive ? [
      { time: arrive.time, label: '到着目標', key: true },
      { time: kickoff, label: 'キックオフ' },
      { time: end.time, label: '終了の目安' },
    ] : [],
    undecided: 'キックオフ時刻未定',
  });
}

function stadiumSection(page) {
  const s = page.stadium;
  if (!s) {
    return section('スタジアム', el('p', { class: 'stadium-name' }, page.summary.venueName),
      el('p', { class: 'muted' }, page.venueUnknown ? '会場が決まっていないため、スタジアムの情報はありません' : '登録されていない会場です'));
  }
  const stations = (s.stations ?? []).map((st) => `${st.name}駅（${[STATION_KINDS[st.kind], st.note].filter(Boolean).join('・')}）`).join('、');
  const airports = (s.airports ?? []).map((a) => `${a.name}（${a.iata}）${a.access_min == null ? '' : `　約${a.access_min}分`}`).join('、');
  return section('スタジアム',
    el('p', { class: 'stadium-name' }, s.name),
    kv([['住所', s.address], ['最寄り', stations], ['シャトル', s.shuttle_note], ['駐車場', s.parking_note], ['最寄り空港', airports]]),
    s.access_url ? extLink({ href: s.access_url, label: '公式のアクセス案内を開く' }) : null,
    s.verified_at ? el('p', { class: 'muted' }, `最終確認 ${String(s.verified_at).replaceAll('-', '/')}`) : null);
}

function routeSection(page, query, settings) {
  if (!query.modes.includes('train') && !query.modes.includes('car')) return null;
  if (page.venueUnknown) return section('経路', el('p', { class: 'muted' }, '会場が決まっていないため、経路は出せません'));
  const to = page.stadium ? (page.stadium.stations?.[0]?.name ?? page.summary.venueName) : page.summary.venueName;
  const { arrive } = page.timeline;
  const here = query.origin === 'here';
  const when = arrive ? `${formatDateJa(arrive.date)} ${arrive.time}着` : `${formatDateJa(page.summary.date)}（キックオフ時刻未定）`;
  const rows = [];
  if (page.train) {
    const hereOrVenue = here || !page.stadium;
    rows.push(extLink({
      href: page.train,
      label: hereOrVenue ? '電車（Googleマップ）' : '電車（Yahoo!乗換案内）',
      sub: hereOrVenue ? `${here ? '現在地' : settings.origin_station} → ${page.summary.venueName}` : `${settings.origin_station} → ${to}　${when}`,
    }));
  }
  if (page.car) {
    rows.push(extLink({ href: page.car, label: '車（Googleマップ）', sub: `${here ? '現在地' : `${settings.origin_station}駅`} → ${page.summary.venueName}` }));
  }
  return section('経路', rows);
}

function busSection(page, query, settings) {
  const b = page.bus;
  if (!b) return null;
  if (b.unsupported) return section('高速バス', el('p', { class: 'muted' }, 'この区間は高速バスの検索に対応していません'));
  const from = settings.origin_prefecture;
  const to = page.stadium.prefecture;
  const date = page.summary.date;
  return section('高速バス',
    extLink({ href: b.outbound, label: '行き：当日', sub: `${from} → ${to}　${formatDateJa(date)}` }),
    extLink({ href: b.outboundNight, label: '行き：前日夜発の夜行便', sub: `${from} → ${to}　${formatDateJa(addDays(date, -1))}` }),
    extLink({ href: b.inbound, label: '帰り：当日', sub: `${to} → ${from}　${formatDateJa(date)}${b.end ? `　${b.end.time}以降の便を選択` : ''}` }),
    b.end ? el('p', { class: 'muted' }, `試合終了の目安 ${b.end.time}`) : null);
}

function lodgingSection(page, query) {
  const l = page.lodging;
  if (!l) return null;
  const range = `${formatDateJa(l.checkIn)}〜${formatDateJa(l.checkOut)}`;
  return section(`宿泊（${LODGING_NAMES[query.lodging]} ${range}）`,
    l.hotels.map((h) => extLink({ href: h.url, label: h.name, sub: `${h.station}駅から徒歩${h.walk_min}分（${STATION_KINDS[h.kind] ?? h.kind}）` })),
    l.prefectureUrl ? extLink({ href: l.prefectureUrl, label: `${page.stadium.prefecture}の東横イン`, sub: `${range} の空室を一覧で見る${l.hotels.length === 0 ? '（駅の近くの店は未登録）' : ''}` }) : null,
    extLink({ href: l.agodaUrl, label: 'Agodaで探す', sub: `${page.stadium?.agoda_area?.name ?? '地域は未登録（Agodaのトップを開く）'}　${range}` }));
}

// 左の列：条件の要約・条件を変える・検索履歴
function sideColumn({ ctx, query, page }) {
  const { settings, masters } = ctx;
  const origin = query.origin === 'here' ? '現在地から' : `${settings.origin_station}駅（${settings.origin_prefecture}）`;
  const change = () => ctx.state.setForm(routeKey(SEARCH_ROUTE), formFromQuery(query));
  const history = ctx.data.history.list();
  const label = (qs) => historyLabel(qs, { fixturesById: masters.fixturesById, clubsById: masters.clubsById, supportClubId: settings.support_club_id });
  return el('div', { class: 'result-side' },
    section('条件', kv([
      ['試合', page.summary.title],
      ['交通手段', query.modes.map((m) => MODE_NAMES[m]).join('・')],
      ['宿泊', LODGING_NAMES[query.lodging]],
      ['出発地', origin],
    ]), el('a', { class: 'row', href: '#/search', onclick: change }, el('span', { class: 'row-main' }, el('span', { class: 'row-label' }, '条件を変える')), el('span', { class: 'row-mark', 'aria-hidden': 'true' }, '›'))),
    history.length === 0 ? null : el('div', { class: 'side-hist' }, el('h2', null, '最近の検索'),
      el('div', { class: 'sec hist' }, history.map((qs) => el('a', { href: `#/result?${qs}`, onclick: () => ctx.data.history.push(qs) },
        el('span', null, label(qs)), el('span', { class: 'muted' }, '再検索'))))));
}

export function renderResult(ctx) {
  const { masters, settings, route } = ctx;
  const query = parseResultQuery(route.query);
  const root = el('div', { class: 'result' });
  if (masters.status === 'offline') root.append(el('p', { class: 'note', role: 'status' }, masters.label));
  if (!masters.data) {
    root.append(section('検索結果', el('p', { class: 'muted' }, masters.status === 'unavailable' ? masters.message : '日程を読み込み中です')));
    return root;
  }
  const page = buildResultPage({ query, masters, settings, supportClubId: settings.support_club_id });
  if (page.error) {
    root.append(section('試合が見つかりません', el('p', { class: 'muted' }, '試合が見つかりません（日程が変わった可能性があります）'),
      innerLink({ href: '#/search', label: '検索画面へ' })));
    return root;
  }
  root.append(el('div', { class: 'two-col' },
    sideColumn({ ctx, query, page }),
    el('div', { class: 'result-main' },
      timeline(page),
      stadiumSection(page),
      routeSection(page, query, settings),
      busSection(page, query, settings),
      page.flight ? renderFlight({ page, query, settings }) : null,
      lodgingSection(page, query),
      section('そのほか',
        page.food ? extLink({ href: page.food, label: '周辺の飲食店', sub: 'Googleマップで検索' }) : null,
        extLink({ href: page.jleague.match, label: 'Jリーグ公式の試合情報', sub: page.jleague.ticket ? null : '試合ページが未登録のときはクラブのページを開きます' }),
        page.jleague.ticket ? extLink({ href: page.jleague.ticket, label: 'Jリーグ公式のチケット' }) : null),
      el('div', { class: 'cta' }, el('a', { class: 'btn btn-wide', href: `#/trips/new?${route.query}` }, 'この条件で遠征予定を作成')))));
  return root;
}
