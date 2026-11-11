// 遠征予定（#/trips・#/trips/:id・#/trips/new。設計書 3章・3.5・5.2.1、FR-24〜26）
// 一覧と詳細は両方作り、S で一覧を隠すのは CSS だけ（D31）。選んだ遠征予定は URL が持つ（D32）
import { el, innerLink, split } from '../components/parts.js';
import { renderTripForm } from './trip-form.js';
import { upcomingTrips } from '../../core/trips.js';
import { tripView, mergeFixtures } from '../../core/trip-view.js';
import { buildResultPage } from '../../core/result-page.js';
import { parseResultQuery } from '../../core/search-query.js';

function row(trip, env, selected) {
  const v = tripView(trip, env);
  return el('a', { class: `item${trip.id === selected ? ' sel' : ''}`, href: `#/trips/${encodeURIComponent(trip.id)}`, 'aria-current': trip.id === selected ? 'true' : null },
    el('span', { class: 'date num' }, el('b', null, v.startText), v.endText ? `〜${v.endText}` : null),
    el('span', { class: 't' }, el('b', null, trip.title), el('span', null, `${v.matchText}　${v.modesText}／${v.lodgingText}`)));
}

function listColumn(ctx, env, selected) {
  const offline = Boolean(ctx.user?.offline);
  const rows = upcomingTrips(ctx.personal.data.trips, env.fixturesById, ctx.today);
  return el('div', null,
    rows.length === 0
      ? el('section', { class: 'sec' }, el('p', { class: 'muted' }, 'これからの遠征予定はありません'), innerLink({ href: '#/search', label: '検索から作る' }))
      : el('div', { class: 'sec list' }, rows.map((t) => row(t, env, selected))),
    !offline && rows.length > 0 ? el('div', { class: 'cta' }, el('a', { class: 'btn btn-sub', href: '#/trips/new' }, '遠征予定を追加')) : null,
    el('p', { class: 'muted' }, '遠征予定は自分だけが見られます。'));
}

// 結果画面の条件から、新規の初期値（tripDraft）を作る。読めない・試合が見つからないときは null（空の新規）
function draftOf(ctx) {
  const query = parseResultQuery(ctx.route.query);
  if (!query || !ctx.masters.data) return null;
  const page = buildResultPage({ query, masters: ctx.masters, settings: ctx.settings, supportClubId: ctx.settings.support_club_id });
  return page.error ? null : page.tripDraft;
}

function notFound() {
  return el('section', { class: 'sec trip-detail' }, el('a', { class: 'back', href: '#/trips' }, '‹ 遠征予定の一覧'),
    el('p', { class: 'muted' }, '遠征予定が見つかりません。削除されたか、別のアカウントの予定です。'),
    innerLink({ href: '#/trips', label: '遠征予定の一覧へ' }));
}

// detail：'none'（一覧だけ）| 'trip'（URL の id の遠征予定）| 'new'（新規）
function renderPage(ctx, detail) {
  const p = ctx.personal;
  const root = el('div', { class: 'trips' });
  if (!p || p.status === 'loading') { root.append(el('p', { class: 'muted' }, '読み込み中です。')); return root; }
  if (p.status === 'unavailable') { root.append(el('p', { class: 'note', role: 'status' }, p.message)); return root; }
  if (p.status === 'offline') root.append(el('p', { class: 'note', role: 'status' }, p.label));

  const env = { fixturesById: mergeFixtures(ctx.masters.fixturesById, p.data.extraFixtures), clubsById: ctx.masters.clubsById, supportClubId: ctx.settings.support_club_id };
  let detailNode = null;
  let selected = null;
  if (detail === 'trip') {
    selected = ctx.route.params.id;
    const trip = p.data.trips.find((t) => t.id === selected);
    detailNode = trip ? renderTripForm(ctx, { trip, initial: trip, env }) : notFound();
  } else if (detail === 'new') {
    detailNode = ctx.user?.offline
      ? el('section', { class: 'sec trip-detail' }, el('p', { class: 'muted' }, 'オフラインのため、遠征予定は作れません。'))
      : renderTripForm(ctx, { trip: null, initial: draftOf(ctx), env });
  }
  root.append(split({ list: listColumn(ctx, env, selected), detail: detailNode }));
  return root;
}

export const renderTrips = (ctx) => renderPage(ctx, 'none');
export const renderTrip = (ctx) => renderPage(ctx, 'trip');
export const renderTripNew = (ctx) => renderPage(ctx, 'new');
