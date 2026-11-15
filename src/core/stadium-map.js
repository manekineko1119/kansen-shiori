// 行ったスタジアムの集計（地図の spec 3.2・3.4・10章）。純粋な関数だけ（DOM・通信・現在時刻を使わない）
import { parseFixtureId } from './fixture-id.js';
export const PREFECTURE_COUNT = 47;

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

  const visited = [...byStadium.values()].sort((a, b) => b.count - a.count || (a.stadium.id < b.stadium.id ? -1 : a.stadium.id > b.stadium.id ? 1 : 0));
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

// 記録の画面の見出しの地図のアイコンの行き先。記録の画面以外は null
export function mapEntryHref(route) {
  if (route.name === 'records') return mapHref(parseMapQuery(route.query));
  if (route.name === 'record') {
    return mapHref({ season: parseFixtureId(route.params?.fixtureId)?.seasonId ?? null });
  }
  return null;
}
