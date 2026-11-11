// 観戦記録（#/records/:試合ID。設計書 3.4.1、FR-50〜55・58a・59・60・52b）
// 順：スコアボード → 試合動画 → 出どころ → 自分の記録 → 遠征。M・L は左に記録の一覧（6-8 で作る。今は空の枠）、右に詳細（D31）
// 編集は URL の ?edit=record（自分の記録）・?edit=fixture（管理者の試合の情報）で開く。入力中の値は ?edit を含まないキーに持つ
import { el, innerLink, split } from '../components/parts.js';
import { renderScoreboard } from '../components/scoreboard.js';
import { renderRecordForm } from './record-edit.js';
import { renderFixtureEdit } from './record-fixture-edit.js';
import { routeKey } from '../view-state.js';
import { mergeFixtures, tripView } from '../../core/trip-view.js';
import { formatYen, formatDateTimeJst } from '../../core/format.js';
import { costTotal, COST_KEYS, COST_LABELS, WATCH_LABELS, VIDEO_KINDS, youtubeId, thumbnailUrl, sourceLabel } from '../../core/record-form.js';

const enc = encodeURIComponent;

function videoRow(kind, video) {
  const label = VIDEO_KINDS[kind];
  if (!video || !/^https:\/\//.test(video.url ?? '')) {
    return el('div', { class: 'yt off' }, el('div', { class: 'th none' }), el('div', null, el('span', { class: 'muted' }, label), el('b', null, '未登録')));
  }
  const id = youtubeId(video.url);
  const thumb = id
    ? el('div', { class: 'th' }, el('img', { src: thumbnailUrl(id), alt: '', loading: 'lazy' }))
    : el('div', { class: `th${kind === 'inside' ? ' inside' : ''}` }, el('i'));
  return el('a', { class: 'yt', href: video.url, target: '_blank', rel: 'noopener noreferrer' }, thumb,
    el('div', null, el('span', { class: 'muted' }, label), el('b', null, video.title || 'YouTube で見る'), video.channel ? el('div', { class: 'muted' }, video.channel) : null,
      el('span', { class: 'sr-only' }, '（外部サイトを開く）')));
}

function videosSection(fixture) {
  const byKind = Object.fromEntries((fixture.fixture_videos ?? []).map((v) => [v.kind, v]));
  return el('section', { class: 'sec' }, el('h2', null, '試合動画'), Object.keys(VIDEO_KINDS).map((k) => videoRow(k, byKind[k])));
}

function sourceSection(fixture, canEditFixture, editHref) {
  const src = sourceLabel(fixture);
  const at = formatDateTimeJst(fixture.result_updated_at ?? fixture.updated_at);
  const text = [src ? `試合の情報：${src}` : null, at ? `更新 ${at}` : null].filter(Boolean).join('　');
  return el('div', { class: 'src' },
    text ? el('p', { class: 'muted' }, text) : null,
    canEditFixture ? el('a', { class: 'btn btn-sub btn-small', href: editHref }, '試合の情報を編集') : null);
}

function recordView(record, editHref, offline) {
  const rows = COST_KEYS.flatMap((k) => [el('span', null, COST_LABELS[k]), el('span', null, formatYen(record[k]))]);
  return el('section', { class: 'sec record-view' },
    el('h2', null, '自分の記録'),
    el('dl', { class: 'kv' }, el('dt', null, '観戦方法'), el('dd', null, WATCH_LABELS[record.watch_style] ?? record.watch_style), el('dt', null, '公開'), el('dd', null, '非公開')),
    el('h2', { class: 'sec-in' }, '費用'),
    el('div', { class: 'costs num' }, rows, el('span', { class: 'tot' }, '合計'), el('span', { class: 'tot fig' }, formatYen(costTotal(record)))),
    record.memo ? [el('h2', { class: 'sec-in' }, '感想'), el('p', { class: 'memo' }, record.memo)] : null,
    offline ? null : el('a', { class: 'btn', href: editHref }, '記録を編集'));
}

function tripSection(trip, env) {
  const v = tripView(trip, env);
  return el('section', { class: 'sec' },
    el('h2', null, '遠征'),
    el('dl', { class: 'kv' },
      el('dt', null, '交通手段'), el('dd', null, v.modesText),
      el('dt', null, '宿泊'), el('dd', null, v.lodgingText),
      trip.transport_memo ? [el('dt', null, '交通のメモ'), el('dd', null, trip.transport_memo)] : null,
      trip.lodging_memo ? [el('dt', null, '宿のメモ'), el('dd', null, trip.lodging_memo)] : null),
    innerLink({ href: `#/trips/${enc(trip.id)}`, label: '遠征予定', sub: trip.title }));
}

function notFound() {
  return el('section', { class: 'sec' }, el('a', { class: 'back', href: '#/records' }, '‹ 観戦記録の一覧'),
    el('h2', null, '試合の情報なし'), el('p', { class: 'muted' }, '日程にない試合です。'));
}

// 自分の記録の部分。未ログインは「観戦記録を追加」だけ（押すとログインへ）
function mineSection(ctx, { fixture, base, formKey, editing }) {
  const offline = Boolean(ctx.user?.offline);
  if (!ctx.user) {
    return el('section', { class: 'sec' }, el('button', { class: 'btn btn-wide', type: 'button', onclick: () => ctx.data.goLogin() }, '観戦記録を追加'));
  }
  const p = ctx.personal;
  if (!p || p.status === 'loading') return el('section', { class: 'sec' }, el('p', { class: 'muted' }, '自分の記録を読み込み中です。'));
  if (p.status === 'unavailable') return el('section', { class: 'sec' }, el('p', { class: 'note', role: 'status' }, p.message));
  const record = p.data.records.find((r) => r.fixture_id === fixture.id) ?? null;
  const trip = p.data.trips.find((t) => t.fixture_id === fixture.id) ?? null;
  if (editing && !offline) return renderRecordForm(ctx, { fixture, record, trip, formKey, doneHref: base });
  if (record) return recordView(record, `${base}?edit=record`, offline);
  if (offline) return el('section', { class: 'sec' }, el('p', { class: 'muted' }, 'この試合の観戦記録はありません。'));
  return el('section', { class: 'sec' }, el('a', { class: 'btn btn-wide', href: `${base}?edit=record` }, '観戦記録を追加'));
}

export function renderRecord(ctx) {
  const root = el('div', { class: 'records' });
  const { masters } = ctx;
  if (masters.status === 'loading') { root.append(el('p', { class: 'muted' }, '読み込み中です。')); return root; }
  if (masters.status === 'unavailable') { root.append(el('p', { class: 'note', role: 'status' }, masters.message)); return root; }
  if (masters.status === 'offline') root.append(el('p', { class: 'note', role: 'status' }, masters.label));

  const id = ctx.route.params.fixtureId;
  const extra = ctx.user ? (ctx.personal?.data?.extraFixtures ?? []) : [];
  const fixture = mergeFixtures(masters.fixturesById, extra)[id] ?? null;
  const detail = el('div', { class: 'record-detail' }, el('a', { class: 'back', href: '#/records' }, '‹ 観戦記録の一覧'));
  if (!fixture) {
    root.append(split({ list: el('div', { class: 'rec-list' }), detail: notFound() }));
    return root;
  }

  const base = `#/records/${enc(id)}`;
  const edit = new URLSearchParams(ctx.route.query).get('edit');
  const offline = Boolean(ctx.user?.offline);
  const canEditFixture = Boolean(ctx.user?.isAdmin) && !offline;
  const plainKey = routeKey({ ...ctx.route, query: '' }); // ?edit の有無で入力中の値を失わない
  const supportClubId = ctx.settings?.support_club_id ?? null;
  const scoreboard = renderScoreboard({ fixture, clubsById: masters.clubsById, stadiumsById: masters.stadiumsById, supportClubId });
  const isExtra = !masters.fixturesById[id];

  detail.append(scoreboard, videosSection(fixture));
  if (edit === 'fixture' && canEditFixture) {
    detail.append(renderFixtureEdit(ctx, {
      fixture, formKey: `${plainKey}:fixture`, doneHref: base, clubsById: masters.clubsById,
      onSaved: async () => { await ctx.data.reloadMasters(); if (isExtra) await ctx.data.reloadPersonal(); },
    }));
  } else {
    detail.append(sourceSection(fixture, canEditFixture, `${base}?edit=fixture`));
  }
  detail.append(mineSection(ctx, { fixture, base, formKey: `${plainKey}:record`, editing: edit === 'record' }));
  if (ctx.user && ctx.personal?.data) {
    const trip = ctx.personal.data.trips.find((t) => t.fixture_id === fixture.id);
    if (trip) detail.append(tripSection(trip, { fixturesById: mergeFixtures(masters.fixturesById, extra), clubsById: masters.clubsById, supportClubId }));
  }
  root.append(split({ list: el('div', { class: 'rec-list' }), detail }));
  return root;
}
