// 行ったスタジアムの集計（地図の spec 3.2・3.4・10章）。純粋な関数だけ（DOM・通信・現在時刻を使わない）
import { JAPAN_SHAPE } from './map/japan-shape.js';

export const PREFECTURE_COUNT = 47;
// 都道府県の番号（JIS。北から南）。行った会場の表の並びに使う
const PREF_CODE = new Map(JAPAN_SHAPE.prefectures.map((p) => [p.name, p.code]));

// 会場の stadium id。fixture-view.js の venueOf と違い、地図では「未定」もホーム会場として数える（spec 10章）。venue_stadium_id があればそれ。会場名が空か「未定」ならホームのクラブのホーム会場。それ以外の名前は null
export function venueOf(fixture, clubsById) {
  if (fixture.venue_stadium_id) return fixture.venue_stadium_id;
  const name = (fixture.venue_name_override ?? '').trim();
  if (name === '' || name === '未定') return clubsById.get(fixture.home_club_id)?.home_stadium_id ?? null;
  return null;
}

// シーズン scope の分母（会場の id の配列）。求められないときは null
function baseStadiumIds({ scope, stadiums, clubsById, seasonClubs, supportClubId }) {
  if (scope === 'all') return stadiums.map((s) => s.id);
  if (!supportClubId || !Array.isArray(seasonClubs)) return null;
  const mine = seasonClubs.find((sc) => sc.club_id === supportClubId);
  if (!mine) return null;
  const known = new Set(stadiums.map((s) => s.id));
  const ids = new Set();
  for (const sc of seasonClubs) {
    if (sc.competition !== mine.competition) continue;
    const id = clubsById.get(sc.club_id)?.home_stadium_id;
    if (id && known.has(id)) ids.add(id);
  }
  return [...ids];
}

export function summarizeStadiumMap({ scope, records, fixtures, clubs, stadiums, visits, seasonClubs, supportClubId }) {
  const clubsById = new Map(clubs.map((c) => [c.id, c]));
  const stadiumsById = new Map(stadiums.map((s) => [s.id, s]));
  const fixturesById = new Map(fixtures.map((f) => [f.id, f]));
  const inScope = (seasonId) => scope === 'all' || seasonId === scope;

  const byStadium = new Map();
  const entry = (stadium) => {
    if (!byStadium.has(stadium.id)) byStadium.set(stadium.id, { stadium, count: 0, fixtureIds: [], visits: [] });
    return byStadium.get(stadium.id);
  };
  const unplacedRows = [];

  // 観戦記録から求める分（現地だけ。1試合を1回と数える）
  for (const r of records) {
    if (r.watch_style !== 'stadium') continue;
    const f = fixturesById.get(r.fixture_id);
    if (!f) {
      // 試合が見つからない記録は捨てない。どのシーズンの試合か分からないので、通算だけに入れる
      if (scope === 'all') unplacedRows.push({ date: '', fixtureId: r.fixture_id, venueName: '' });
      continue;
    }
    if (!inScope(f.season_id)) continue;
    const stadium = stadiumsById.get(venueOf(f, clubsById));
    if (!stadium) {
      unplacedRows.push({ date: f.match_date ?? '', fixtureId: f.id, venueName: (f.venue_name_override ?? '').trim() });
      continue;
    }
    const e = entry(stadium);
    e.count += 1;
    e.fixtureIds.push(f.id);
  }

  // 手で足した分（1件を1回と数える。知らない会場は数えない）
  for (const v of visits) {
    const stadium = stadiumsById.get(v.stadium_id);
    if (!stadium || !inScope(v.season_id)) continue;
    const e = entry(stadium);
    e.count += 1;
    e.visits.push({ id: v.id, season_id: v.season_id });
  }

  // 並びは北から南の県の順。同じ県なら会場の登録順（回数は出さないので並びにも使わない。2026-11-16 ユーザーが決定）
  const stadiumIndex = new Map(stadiums.map((s, i) => [s.id, i]));
  const rank = (e) => [PREF_CODE.get(e.stadium.prefecture) ?? 99, stadiumIndex.get(e.stadium.id) ?? Infinity];
  const visited = [...byStadium.values()].sort((a, b) => { const [pa, ia] = rank(a); const [pb, ib] = rank(b); return pa - pb || ia - ib; });
  const prefectures = [...new Set(visited.map((e) => e.stadium.prefecture).filter(Boolean))];

  const baseIds = baseStadiumIds({ scope, stadiums, clubsById, seasonClubs, supportClubId });
  const prefAll = baseIds === null
    ? null
    : scope === 'all'
      ? PREFECTURE_COUNT
      : new Set(baseIds.map((id) => stadiumsById.get(id)?.prefecture).filter(Boolean)).size;

  const unplaced = unplacedRows
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map(({ fixtureId, venueName }) => ({ fixtureId, venueName }));

  return {
    visited,
    baseIds,
    prefectures,
    totals: { visited: visited.length, all: baseIds === null ? null : baseIds.length, prefVisited: prefectures.length, prefAll },
    unplaced,
  };
}

// 地図の URL のシーズン（?s=）。なければ通算
export function parseMapQuery(query) {
  return { season: new URLSearchParams(query ?? '').get('s') || null };
}

export function mapHref({ season = null } = {}) {
  return season ? `#/map?s=${encodeURIComponent(season)}` : '#/map';
}

// 見出しの地図のアイコンの行き先。入口は観戦記録の一覧だけ（一覧で選んでいるシーズンを引き継ぐ）。ほかの画面は null
export function mapEntryHref(route) {
  if (route.name === 'records') return mapHref(parseMapQuery(route.query));
  return null;
}

// 地図でタップした県の会場（地図の spec 4.2）。渡した順のまま、同じ会場は1つにする。県が分からないときは空
export function stadiumsInPrefecture(stadiums, prefecture) {
  if (!prefecture) return [];
  const seen = new Set();
  return stadiums.filter((s) => s.prefecture === prefecture && !seen.has(s.id) && seen.add(s.id));
}
