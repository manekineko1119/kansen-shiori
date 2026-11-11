// 観戦記録の一覧（集計・直近5試合・行）。#/records と、観戦記録の詳細の左の枠で共通に使う（設計書 3.4.2・3.5）
import { el, outcomeBadge } from './parts.js';
import { recordRows, recordsHref, seasonLabel } from '../../core/record-list.js';
import { fixtureSide, opponentOf } from '../../core/fixture-view.js';
import { formatDateJa, formatYen } from '../../core/format.js';
import { OUTCOME_MARK, recentForm } from '../../core/result.js';
import { seasonStats } from '../../core/stats.js';

const enc = encodeURIComponent;
const note = (text) => el('p', { class: 'note', role: 'status' }, text);

// シーズンの切り替えと「観戦した試合だけ」。値の正は URL（D32）。変えたら URL を替えて描き直す
function controls(ctx, { seasonId, seasons, onlyWatched }) {
  const options = Array.isArray(seasons) && seasons.length > 0 ? seasons : [{ id: seasonId }];
  const go = (season, only) => ctx.navigate(recordsHref({ season: season === ctx.masters.data?.season?.id ? null : season, only }));
  return el('div', { class: 'rec-controls' },
    el('select', { class: 'input', name: 'season', 'aria-label': 'シーズン', onchange: (e) => go(e.target.value, onlyWatched) },
      options.map((s) => el('option', { value: s.id, selected: s.id === seasonId }, seasonLabel(s.id)))),
    el('label', { class: 'chip' },
      el('input', { type: 'checkbox', name: 'only', checked: onlyWatched, onchange: (e) => go(seasonId, e.target.checked) }),
      el('span', null, '観戦した試合だけ')));
}

function statsBand(stats) {
  const cell = (value, label) => el('div', null, el('b', { class: 'fig num' }, value), el('span', null, label));
  return el('div', { class: 'stats' },
    cell(String(stats.count), '観戦'), cell(String(stats.byStyle.stadium), '現地'),
    cell(`${stats.win}-${stats.draw}-${stats.lose}`, '勝-分-敗'), cell(formatYen(stats.costTotal), '費用'));
}

function formLine(form) {
  return el('div', { class: 'rec-form num', role: 'img', 'aria-label': form.length ? `直近${form.length}試合の結果` : '直近の結果なし' },
    el('span', null, '直近5試合'),
    form.length ? form.map((o) => el('i', { class: `res ${o}` }, OUTCOME_MARK[o])) : el('em', null, 'なし'));
}

function row(r, { supportClubId, clubsById, selectedId }) {
  const f = r.fixture;
  const sel = f.id === selectedId;
  return el('a', { class: `item${sel ? ' sel' : ''}`, href: `#/records/${enc(f.id)}`, 'aria-current': sel ? 'true' : null, 'data-fixture': f.id },
    el('span', { class: 'date num' }, el('b', null, formatDateJa(f.match_date)), el('span', { class: r.record ? '' : 'none' }, r.style)),
    r.side ? el('span', { class: `ha ${r.side.toLowerCase()}` }, r.side) : null,
    el('span', { class: 't' }, el('b', null, `vs ${opponentOf(f, supportClubId, clubsById).short_name}`)),
    el('span', { class: 'res-wrap' }, outcomeBadge(r.outcome), r.score ? el('span', { class: 'num score' }, r.score) : null),
    r.record ? null : el('span', { class: 'add muted' }, '＋追加'),
    el('span', { class: 'row-mark', 'aria-hidden': 'true' }, '›'));
}

// seasonId のシーズンの一覧。seasons は切り替えの選択肢（undefined＝読み込み中、null＝読めない。切り替えを出さないときは不要）
// selectedId：選んでいる行（詳細の左の枠）。withControls が false のときは、シーズン名だけを出す
export function renderRecordList(ctx, { seasonId, seasons, onlyWatched = false, selectedId = null, withControls = true }) {
  const root = el('div', { class: 'rec-list' });
  const { masters, personal } = ctx;
  const supportClubId = ctx.settings?.support_club_id ?? null;
  const currentId = masters.data?.season?.id ?? null;
  root.append(withControls ? controls(ctx, { seasonId, seasons, onlyWatched }) : el('p', { class: 'rec-season' }, seasonLabel(seasonId)));

  // そのシーズンの試合。今のシーズンは共通データをそのまま使う（通信しない）
  let fixtures;
  if (seasonId === currentId) fixtures = masters.data?.fixtures ?? [];
  else if (masters.status === 'offline' || ctx.user?.offline) {
    root.append(note('オフラインのため、このシーズンは表示できません'));
    return root;
  } else fixtures = ctx.data.seasonFixtures(seasonId);
  if (fixtures === undefined) { root.append(el('p', { class: 'muted' }, '読み込み中…')); return root; }
  if (fixtures === null) { root.append(note('読み込めませんでした')); return root; }

  if (!personal || personal.status === 'loading') { root.append(el('p', { class: 'muted' }, '読み込み中…')); return root; }
  if (personal.status === 'unavailable') { root.append(note(personal.message)); return root; }

  const own = fixtures.filter((f) => fixtureSide(f, supportClubId) !== null);
  const byId = Object.fromEntries(own.map((f) => [f.id, f]));
  // 集計は、そのシーズンの記録だけ
  const records = personal.data.records.filter((r) => byId[r.fixture_id]);
  const rows = recordRows({ fixtures: own, records, supportClubId, today: ctx.today, onlyWatched });
  root.append(formLine(recentForm(own, supportClubId, ctx.today)), statsBand(seasonStats(records, byId, supportClubId)));

  const env = { supportClubId, clubsById: masters.clubsById, selectedId };
  root.append(rows.length === 0
    ? el('p', { class: 'muted rec-empty' }, onlyWatched ? '観戦した試合はまだありません' : '終わった試合はまだありません')
    : el('div', { class: 'sec list' }, rows.map((r) => row(r, env))));
  return root;
}
