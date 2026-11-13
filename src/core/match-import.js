// 試合ページの事実（parseMatchDetails の戻り値）を、日程（fixtures）の行にする照らし合わせ（設計書 3.4・4.4）。
// 純粋な関数だけ。通信・DOM・現在時刻の取得はしない（現在時刻は nowIso で受け取る）。

import { buildFixtureId, normalizeRound } from './fixture-id.js';
import { buildScorers, clubSlugFromUrl } from '../../supabase/functions/_shared/jleague-parse.js';
import { normalizeName, toHalfWidth } from '../../supabase/functions/_shared/text.js';

// URL の大会 → 日程の大会（fixtures.competition）
export const CUP_COMPETITIONS = { leaguecup: 'LEVAIN' };

export function seasonForDate(seasons, date) {
  return (seasons ?? []).find((s) => s.starts_on <= date && date <= s.ends_on) ?? null;
}

// 会場名の比較用：半角にして空白をまとめ、前後を取る
function venueKey(s) {
  return toHalfWidth(s).replace(/\s+/g, ' ').trim();
}

function findClub(side, clubs) {
  const byCode = clubs.find((c) => side.teamCode && clubSlugFromUrl(c.jleague_url) === side.teamCode);
  if (byCode) return byCode;
  const names = [side.name, side.nameS].filter(Boolean).map(normalizeName);
  return clubs.find((c) => [c.name, c.short_name, ...(c.aliases ?? [])]
    .filter(Boolean).map(normalizeName).some((n) => names.includes(n))) ?? null;
}

// 会場：ホームの会場なら null 2つ（'home'）、登録済みならその id、なければ名前を上書き欄へ
function planVenue(stadiumName, homeClub, stadiums) {
  if (!stadiumName) return { kind: 'none', stadiumId: null, nameOverride: null, label: '会場未定' };
  const key = venueKey(stadiumName);
  const home = stadiums.find((s) => s.id === homeClub.home_stadium_id);
  if (home && venueKey(home.name) === key) {
    return { kind: 'home', stadiumId: null, nameOverride: null, label: home.name };
  }
  const hit = stadiums.find((s) => venueKey(s.name) === key);
  if (hit) return { kind: 'stadium', stadiumId: hit.id, nameOverride: null, label: hit.name };
  return { kind: 'name', stadiumId: null, nameOverride: stadiumName, label: stadiumName };
}

function resultColumns(page, ids, nowIso, warnings) {
  const built = buildScorers(page, ids);
  const row = {
    status: 'finished',
    home_score: page.home.score,
    away_score: page.away.score,
    home_pk: page.penalty?.home ?? null,
    away_pk: page.penalty?.away ?? null,
    scorers: built.scorers,
    result_source: 'api',
    result_updated_at: nowIso,
  };
  if (built.reason) {
    row.scorers_failed_at = nowIso;
    warnings.push(built.reason);
  } else {
    row.scorers_fetched_at = nowIso;
  }
  return { row, scorerCount: built.scorers.length };
}

export function planMatchImport(page, { url, season, clubs, stadiums, existing, supportClubId, nowIso }) {
  const errors = [];
  const warnings = [];
  const competition = CUP_COMPETITIONS[page.tournament];
  if (!competition) {
    errors.push(`${page.tournamentName ?? page.tournament} は URL で登録できません`);
  }
  if (!season) errors.push(`この日付（${page.date}）のシーズンが登録されていません`);
  const homeClub = findClub(page.home, clubs);
  const awayClub = findClub(page.away, clubs);
  for (const [club, side] of [[homeClub, page.home], [awayClub, page.away]]) {
    if (!club) errors.push(`${side.name} が登録されていません。先にクラブを登録してください`);
  }
  if (errors.length > 0) return { ok: false, errors };

  const round = normalizeRound(page.section);
  const id = buildFixtureId({
    seasonId: season.id, competition, round, matchDate: page.date,
    homeClubId: homeClub.id, awayClubId: awayClub.id,
  });
  const rows = existing ?? [];
  const current = rows.find((f) => f.id === id) ?? null;
  const other = rows.find((f) => f.id !== id && f.jleague_match_url === url);
  if (other) {
    return { ok: false, errors: [`この試合ページはすでに別の試合ID（${other.id}）に登録されています`] };
  }

  if (page.canceledInfo) warnings.push('中止・延期の案内があります');
  if (supportClubId && homeClub.id !== supportClubId && awayClub.id !== supportClubId) {
    warnings.push('応援クラブの試合ではありません');
  }

  const venue = planVenue(page.stadiumName, homeClub, stadiums ?? []);
  const finished = page.state === 'finished';
  const manual = current?.result_source === 'manual';
  const row = {};
  const schedule = {
    match_date: page.date, kickoff: page.kickoff ?? null,
    venue_stadium_id: venue.stadiumId, venue_name_override: venue.nameOverride,
  };
  let score = null;
  let pk = null;
  let scorerCount = 0;

  if (!current) {
    Object.assign(row, { id, season_id: season.id, competition, round: round || null }, schedule);
    row.jleague_match_url = url;
    if (!finished) row.status = 'scheduled';
  } else {
    if (current.status !== 'finished' && !finished) Object.assign(row, schedule);
    if (!current.jleague_match_url) row.jleague_match_url = url;
  }

  if (finished) {
    score = [page.home.score, page.away.score];
    if (page.penalty) pk = [page.penalty.home, page.penalty.away];
    if (manual) {
      warnings.push('手で直した試合なので、結果・得点者・PK は更新しません');
    } else {
      const res = resultColumns(page, { homeClubId: homeClub.id, awayClubId: awayClub.id }, nowIso, warnings);
      Object.assign(row, res.row);
      scorerCount = res.scorerCount;
    }
  }

  if (current && Object.keys(row).length === 0) {
    return { ok: false, errors: ['更新する項目がありません'] };
  }
  const view = {
    competition, round, date: page.date, kickoff: page.kickoff ?? null,
    homeClubId: homeClub.id, awayClubId: awayClub.id,
    venue: { kind: venue.kind, label: venue.label },
    state: page.state, score, pk, scorerCount,
  };
  return { ok: true, mode: current ? 'update' : 'insert', id, row, warnings, view };
}
