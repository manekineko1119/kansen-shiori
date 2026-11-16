// 観戦記録（#/records/:試合ID。設計書 3.4.1、FR-50〜55・58a・59・60・52b）
// 順：スコアボード → 試合動画 → 出どころ → 自分の記録 → 遠征。M・L は左に記録の一覧（record-list.js。選んでいる試合のシーズン）、右に詳細（D31）
// 編集は URL の ?edit=record（自分の記録）・?edit=fixture（管理者の試合の情報）で開く。入力中の値は ?edit を含まないキーに持つ
import { el, innerLink, split } from '../components/parts.js';
import { renderScoreboard } from '../components/scoreboard.js';
import { renderRecordForm } from './record-edit.js';
import { photoView } from './record-photo.js';
import { renderRecordList } from '../components/record-list.js';
import { parseRecordsQuery, recordsHref } from '../../core/record-list.js';
import { renderFixtureEdit } from './record-fixture-edit.js';
import { routeKey } from '../view-state.js';
import { mergeFixtures, tripView } from '../../core/trip-view.js';
import { formatYen, formatDateTimeJst } from '../../core/format.js';
import { costTotal, COST_KEYS, COST_LABELS, WATCH_LABELS, VIDEO_KINDS, youtubeId, thumbnailUrl, sourceLabel } from '../../core/record-form.js';
import { safeHttpsUrl } from '../../core/safe-url.js';

const enc = encodeURIComponent;

function videoRow(kind, video) {
  const label = VIDEO_KINDS[kind];
  const url = safeHttpsUrl(video?.url); // https の URL だけをリンクにする（設計書 11.6）
  if (!url) {
    return el('div', { class: 'yt off' }, el('div', { class: 'th none' }), el('div', null, el('span', { class: 'muted' }, label), el('b', null, '未登録')));
  }
  const id = youtubeId(url);
  const thumb = id
    ? el('div', { class: 'th' }, el('img', { src: thumbnailUrl(id), alt: '', loading: 'lazy' }))
    : el('div', { class: `th${kind === 'inside' ? ' inside' : ''}` }, el('i'));
  return el('a', { class: 'yt', href: url, target: '_blank', rel: 'noopener noreferrer' }, thumb,
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

function recordView(ctx, record, editHref, offline) {
  const rows = COST_KEYS.flatMap((k) => [el('span', null, COST_LABELS[k]), el('span', null, formatYen(record[k]))]);
  return el('section', { class: 'sec record-view' },
    el('h2', null, '自分の記録'),
    el('dl', { class: 'kv' }, el('dt', null, '観戦方法'), el('dd', null, WATCH_LABELS[record.watch_style] ?? record.watch_style), el('dt', null, '公開'), el('dd', null, '非公開')),
    record.photo_path ? photoView(ctx, record.photo_path) : null,
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
  if (record) return recordView(ctx, record, `${base}?edit=record`, offline);
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
  const detail = el('div', { class: 'record-detail' }, el('a', { class: 'back', href: '#/records' }, '‹ 観戦記録の一覧'));
  // 共通データ → 自分の extraFixtures → ID で1件読む（前のシーズンの試合。D28）。読み込み中は「読み込み中…」
  let fixture = mergeFixtures(masters.fixturesById, extra)[id] ?? null;
  let loading = false;
  if (!fixture) {
    if (ctx.user && (!ctx.personal || ctx.personal.status === 'loading')) loading = true;
    else {
      const found = ctx.data.fetchFixture(id);
      if (found === undefined) loading = true;
      else fixture = found;
    }
  }
  if (loading) {
    root.append(split({ list: el('div', { class: 'rec-list' }), detail: el('section', { class: 'sec' }, el('p', { class: 'muted' }, '読み込み中…')) }));
    return root;
  }
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
  const isFetched = isExtra && !extra.some((f) => f.id === id); // 画面から読んだ試合

  detail.append(scoreboard, videosSection(fixture));
  if (edit === 'fixture' && canEditFixture) {
    detail.append(renderFixtureEdit(ctx, {
      fixture, formKey: `${plainKey}:fixture`, doneHref: base, clubsById: masters.clubsById,
      onSaved: async () => {
        if (isFetched) ctx.data.forgetFixture(id); // 読み直す
        await ctx.data.reloadMasters();
        if (isExtra) await ctx.data.reloadPersonal();
      },
    }));
  } else {
    detail.append(sourceSection(fixture, canEditFixture, `${base}?edit=fixture`));
  }
  detail.append(mineSection(ctx, { fixture, base, formKey: `${plainKey}:record`, editing: edit === 'record' }));
  if (ctx.user && ctx.personal?.data) {
    const trip = ctx.personal.data.trips.find((t) => t.fixture_id === fixture.id);
    if (trip) detail.append(tripSection(trip, { fixturesById: mergeFixtures(masters.fixturesById, extra), clubsById: masters.clubsById, supportClubId }));
  }
  // 左：選んでいる試合のシーズンの一覧（選んでいる行に印）。シーズンの切り替えと絞り込み（?only=1）も出す。未ログインは空の枠
  const season = fixture.season_id ?? null;
  const { only } = parseRecordsQuery(ctx.route.query);
  const seasons = masters.status !== 'offline' && !ctx.user?.offline ? ctx.data.seasons() : null;
  const list = ctx.user && season ? renderRecordList(ctx, { seasonId: season, seasons, onlyStadium: only, selectedId: id }) : el('div', { class: 'rec-list' });
  detail.firstChild.setAttribute('href', recordsHref({ season: season === masters.data?.season?.id ? null : season, only }));
  root.append(split({ list, detail }));
  return root;
}
