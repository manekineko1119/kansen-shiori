// 検索画面の判断（入力 → 結果画面の URL の条件、検索履歴の表示名、日程の選択肢、きっぷの文字）。設計書 3.1、FR-01〜08・16
import { buildResultQuery, parseResultQuery } from './search-query.js';
import { isValidDate, compareDateTime } from './time.js';
import { formatDateJa, daysUntil } from './format.js';
import { fixtureSide, opponentOf, venueOf, competitionLabel } from './fixture-view.js';
import { toHalfWidth } from '../../supabase/functions/_shared/text.js';

export const MODE_NAMES = { train: '電車', car: '車', bus: '高速バス', plane: '飛行機' };
export const LODGING_NAMES = { none: '日帰り', pre: '前泊', post: '後泊', both: '前泊＋後泊' };

export function searchDefaults(settings) {
  return { kind: 'fixture', fixtureId: null, modes: [...(settings?.default_modes ?? [])], lodging: 'none', origin: 'settings' };
}

const half = (v) => toHalfWidth(v).trim();

// '9:00' → '09:00'。時刻にできなければ null
function normalizeTime(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(half(v));
  if (!m) return null;
  const t = `${m[1].padStart(2, '0')}:${m[2]}`;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : null;
}

// values = { kind, fixtureId, opponentId, date, kickoff, venue, modes, lodging, origin }
export function queryFromForm(values) {
  const errors = {};
  const modes = values.modes ?? [];
  let fixtureId = null;
  let custom = null;
  if (values.kind === 'custom') {
    const date = half(values.date);
    const opponentId = half(values.opponentId);
    const venue = String(values.venue ?? '').trim();
    const rawKickoff = half(values.kickoff);
    const kickoff = rawKickoff === '' ? '' : normalizeTime(rawKickoff);
    if (!isValidDate(date)) errors.date = '日付を入力してください';
    if (kickoff === null) errors.kickoff = 'キックオフは 19:00 の形で入力してください';
    if (opponentId === '' && venue === '') errors.opponentId = '対戦相手か会場を入力してください';
    custom = { opponentId, date, kickoff, venue };
  } else {
    fixtureId = String(values.fixtureId ?? '');
    if (fixtureId === '') errors.fixtureId = '試合を選んでください';
  }
  if (modes.length === 0) errors.modes = '交通手段を1つ以上選んでください';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, qs: buildResultQuery({ fixtureId, custom, modes, lodging: values.lodging, origin: values.origin }) };
}

// 結果画面の条件（parseResultQuery の値）→ 検索画面の入力欄の値（「条件を変える」で入れ直す。bindForm の名前に合わせる）
export function formFromQuery(q) {
  const c = q.custom ?? {};
  return {
    kind: q.fixtureId ? 'fixture' : 'custom',
    fixtureId: q.fixtureId ?? '', opponentId: c.opponentId ?? '', date: c.date ?? '', kickoff: c.kickoff ?? '', venue: c.venue ?? '',
    ...Object.fromEntries(Object.keys(MODE_NAMES).map((m) => [`mode_${m}`, q.modes.includes(m)])),
    lodging: q.lodging, origin: q.origin,
  };
}

// 「10/25（日） A 岐阜」。応援クラブの試合でなければ H/A は付けない
export function fixtureLabel(f, { clubsById, supportClubId }) {
  const side = fixtureSide(f, supportClubId);
  return [formatDateJa(f.match_date), side, opponentOf(f, supportClubId, clubsById).short_name].filter(Boolean).join(' ');
}

// 「10/25（日） A 岐阜・電車・高速バス・後泊」
export function historyLabel(qs, { fixturesById, clubsById, supportClubId }) {
  const q = parseResultQuery(qs);
  if (!q) return '条件を読み取れません';
  const f = q.fixtureId ? fixturesById?.[q.fixtureId] : null;
  let head;
  if (q.fixtureId) {
    head = f ? fixtureLabel(f, { clubsById, supportClubId }) : '試合の情報なし';
  } else {
    const c = q.custom;
    const name = c.opponentId ? (clubsById?.[c.opponentId]?.short_name ?? c.opponentId) : c.venue;
    head = [c.date ? formatDateJa(c.date) : null, name].filter(Boolean).join(' ');
  }
  const modes = q.modes.map((m) => MODE_NAMES[m]);
  const lodging = q.lodging === 'none' ? [] : [LODGING_NAMES[q.lodging]];
  return [head, ...modes, ...lodging, ...(q.origin === 'here' ? ['現在地から'] : [])].join('・');
}

// 日程の選択肢：今日以降の応援クラブの試合（中止・延期を除く）。日付・キックオフ順
export function upcomingFixtures(fixtures, supportClubId, today) {
  return fixtures
    .filter((f) => (f.home_club_id === supportClubId || f.away_club_id === supportClubId)
      && f.status !== 'postponed' && f.status !== 'cancelled' && f.match_date >= today)
    .sort((a, b) => compareDateTime({ date: a.match_date, time: a.kickoff ?? '00:00' }, { date: b.match_date, time: b.kickoff ?? '00:00' }));
}

// きっぷの文字。区間の到着側は、相手クラブの短い名前（スタジアムの市は取らない）
export function ticketInfo(f, { clubsById, stadiumsById, supportClubId, originStation, today }) {
  const days = daysUntil(f.match_date, today);
  const name = (id) => clubsById?.[id]?.name ?? id;
  return {
    kicker: `次のアウェイ戦　${competitionLabel(f)}`.trim(),
    from: originStation,
    to: opponentOf(f, supportClubId, clubsById).short_name,
    vs: `${name(f.home_club_id)} vs ${name(f.away_club_id)}`,
    where: `${formatDateJa(f.match_date)}${venueOf(f, { clubsById, stadiumsById }).name}`,
    kickoff: f.kickoff ?? 'キックオフ未定',
    days: days <= 0 ? '今日' : `あと${days}日`,
  };
}

// 手入力の対戦相手の選択肢（設計書 3.1）。応援クラブと同じ大会を先頭に、残りは J1・J2・J3、所属のないクラブは「その他」。
// seasonClubs は今のシーズンの所属の行（competition・club_id）。カップ戦でほかの大会のクラブとも当たるので、絞らずにまとめる
const COMPETITION_ORDER = ['J1', 'J2', 'J3'];
export function opponentGroups({ clubs, seasonClubs, supportClubId }) {
  const compOf = new Map((seasonClubs ?? []).map((r) => [r.club_id, r.competition]));
  const own = compOf.get(supportClubId);
  const comps = [...new Set([own, ...COMPETITION_ORDER, ...compOf.values()].filter(Boolean))];
  const groups = [...comps.map((c) => ({ label: c, comp: c })), { label: 'その他', comp: null }];
  return groups
    .map(({ label, comp }) => ({
      label,
      clubs: (clubs ?? []).filter((c) => c.id !== supportClubId && (compOf.get(c.id) ?? null) === comp),
    }))
    .filter((g) => g.clubs.length > 0);
}
