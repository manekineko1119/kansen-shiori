// 遠征予定の画面の判断（行・詳細の文字、入力 ↔ 保存する値、試合の選択肢）。設計書 3章・5.2.1、D28・D30。通信しない純粋な関数
import { tripDate } from './trips.js';
import { LODGING, lodgingDates } from './lodging.js';
import { MODE_NAMES, LODGING_NAMES, fixtureLabel } from './search-form.js';
import { fixtureSide, opponentOf } from './fixture-view.js';
import { formatDateJa } from './format.js';

const MODES = Object.keys(MODE_NAMES);

// 今のシーズンの試合と、それ以外の試合（extraFixtures）を合わせた引き表。同じ ID は今のシーズンが優先
export function mergeFixtures(fixturesById, extraFixtures = []) {
  return { ...Object.fromEntries(extraFixtures.map((f) => [f.id, f])), ...fixturesById };
}

const clubName = (id, clubsById) => clubsById?.[id]?.short_name ?? id;

// 行・詳細に出す文字。試合が見つからなければ custom_venue・custom_date、なければ「試合の情報なし」（D28）
export function tripView(trip, { fixturesById, clubsById, supportClubId }) {
  const f = trip.fixture_id == null ? null : fixturesById[trip.fixture_id] ?? null;
  let matchText;
  if (f) {
    matchText = fixtureSide(f, supportClubId)
      ? `vs ${opponentOf(f, supportClubId, clubsById).short_name}`
      : `${clubName(f.home_club_id, clubsById)} vs ${clubName(f.away_club_id, clubsById)}`;
  } else {
    matchText = trip.custom_venue || '試合の情報なし';
  }
  const date = tripDate(trip, fixturesById) ?? trip.custom_date ?? null;
  const lodging = LODGING.includes(trip.lodging) ? trip.lodging : 'none';
  const stay = date ? lodgingDates(date, lodging) : null;
  const modes = (trip.modes ?? []).map((m) => MODE_NAMES[m]).filter(Boolean);
  return {
    fixture: f, date, matchText,
    dateText: date ? formatDateJa(date) : '日付未定',
    startText: date ? formatDateJa(stay ? stay.checkIn : date) : '日付未定',
    endText: stay ? formatDateJa(stay.checkOut) : null,
    modesText: modes.length ? modes.join('・') : '交通手段未定',
    lodgingText: LODGING_NAMES[lodging],
  };
}

// 遠征予定（または結果画面の下書き）→ 入力欄の値
export function tripFormValues(trip) {
  return {
    title: trip.title ?? '',
    fixture_id: trip.fixture_id ?? '',
    custom_venue: trip.custom_venue ?? '',
    custom_date: trip.custom_date ?? '',
    ...Object.fromEntries(MODES.map((m) => [`mode_${m}`, (trip.modes ?? []).includes(m)])),
    lodging: LODGING.includes(trip.lodging) ? trip.lodging : 'none',
    transport_memo: trip.transport_memo ?? '',
    lodging_memo: trip.lodging_memo ?? '',
    memo: trip.memo ?? '',
  };
}

// 入力欄の値 → 保存する遠征予定（検証・空の扱いは data/trips.js と validateTrip）
export function tripFromForm(values, id = null) {
  const trip = {
    fixture_id: values.fixture_id ?? '',
    custom_venue: values.custom_venue ?? '',
    custom_date: values.custom_date ?? '',
    title: values.title ?? '',
    modes: MODES.filter((m) => values[`mode_${m}`] === true),
    lodging: LODGING.includes(values.lodging) ? values.lodging : 'none',
    transport_memo: values.transport_memo ?? '',
    lodging_memo: values.lodging_memo ?? '',
    memo: values.memo ?? '',
  };
  return id ? { id, ...trip } : trip;
}

// 「試合」の選択肢：応援クラブの試合を日付順。選んでいる試合が欄外なら足し、見つからなければ「試合の情報なし」
export function fixtureOptions({ fixturesById, clubsById, supportClubId, selectedId }) {
  const list = Object.values(fixturesById)
    .filter((f) => fixtureSide(f, supportClubId))
    .sort((a, b) => (a.match_date < b.match_date ? -1 : a.match_date > b.match_date ? 1 : 0))
    .map((f) => ({ value: f.id, label: fixtureLabel(f, { clubsById, supportClubId }) }));
  if (selectedId && !list.some((o) => o.value === selectedId)) {
    const f = fixturesById[selectedId];
    list.push({ value: selectedId, label: f ? fixtureLabel(f, { clubsById, supportClubId }) : '試合の情報なし' });
  }
  return list;
}
