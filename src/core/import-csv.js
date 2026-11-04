// 日程の貼り付けの取り込み（設計書 5.5、FR-42）。
// カンマ区切り・タブ区切りの文字列を、fixtures の行と、行ごとのエラーに分ける。
import { buildFixtureId } from './fixture-id.js';
import { isValidDate } from './time.js';
import { normalizeJleagueMatchUrl } from './links/jleague.js';
import { toHalfWidth, normalizeName } from '../../supabase/functions/_shared/text.js';

const pad2 = (n) => String(n).padStart(2, '0');

// 実在する日付なら 'YYYY-MM-DD'、そうでなければ null
function toIsoDate(y, m, d) {
  const iso = `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`;
  return isValidDate(iso) ? iso : null;
}

// 日付の文字列 → 'YYYY-MM-DD'。シーズンの範囲に入らなければ理由つきで失敗
function parseDate(raw, season) {
  const s = toHalfWidth(raw).trim();
  const full = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/.exec(s);
  const short = /^(\d{1,2})[/.-](\d{1,2})$/.exec(s);
  if (!full && !short) return { error: `日付の形が正しくありません: ${raw}` };
  const inRange = (iso) => iso !== null && iso >= season.starts_on && iso <= season.ends_on;
  if (full) {
    const iso = toIsoDate(Number(full[1]), Number(full[2]), Number(full[3]));
    if (iso === null) return { error: `存在しない日付です: ${raw}` };
    return inRange(iso) ? { value: iso } : { error: `シーズンの範囲外の日付です: ${raw}` };
  }
  const m = Number(short[1]);
  const d = Number(short[2]);
  const startYear = Number(season.starts_on.slice(0, 4));
  const endYear = Number(season.ends_on.slice(0, 4));
  for (let y = startYear; y <= endYear; y += 1) {
    const iso = toIsoDate(y, m, d);
    if (inRange(iso)) return { value: iso };
  }
  return { error: `シーズンの範囲外の日付です: ${raw}` };
}

// キックオフ：未定・-・空は null、HH:MM はそのまま（1桁の時は0を補う）
function parseKickoff(raw) {
  const s = toHalfWidth(raw).trim();
  if (s === '' || s === '未定' || s === '-') return { value: null };
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) {
    return { error: `キックオフの形が正しくありません: ${raw}` };
  }
  return { value: `${pad2(Number(m[1]))}:${m[2]}` };
}

// クラブ名の索引（name・short_name・aliases の正規化名 → クラブIDの集合）
function buildClubIndex(clubs) {
  const index = new Map();
  for (const club of clubs) {
    for (const name of [club.name, club.short_name, ...(club.aliases ?? [])]) {
      const key = normalizeName(name);
      if (key === '') continue;
      if (!index.has(key)) index.set(key, new Set());
      index.get(key).add(club.id);
    }
  }
  return index;
}

// クラブ名 → { id } か { error }（未登録・複数のクラブに当てはまる場合はエラー）
function findClub(raw, clubIndex) {
  const ids = clubIndex.get(normalizeName(raw));
  if (!ids) return { error: `未登録のクラブです: ${raw}` };
  if (ids.size > 1) return { error: `クラブ名が複数のクラブに当てはまります: ${raw}` };
  return { id: [...ids][0] };
}

function parseLine(cells, ctx) {
  if (cells.length < 6) return { error: '列が足りません（日付・キックオフ・大会・節・ホーム・アウェイが必要です）' };
  const [dateRaw, kickoffRaw, competitionRaw, roundRaw, homeRaw, awayRaw, venueRaw = '', urlRaw = ''] = cells;

  const date = parseDate(dateRaw, ctx.season);
  if (date.error) return date;
  const kickoff = parseKickoff(kickoffRaw);
  if (kickoff.error) return kickoff;

  const home = findClub(homeRaw, ctx.clubIndex);
  if (home.error) return home;
  const away = findClub(awayRaw, ctx.clubIndex);
  if (away.error) return away;
  const homeId = home.id;
  const awayId = away.id;
  if (homeId === awayId) return { error: 'ホームとアウェイが同じクラブです' };

  let url = null;
  if (urlRaw !== '') {
    url = normalizeJleagueMatchUrl(toHalfWidth(urlRaw).trim());
    if (url === null) return { error: `Jリーグ公式の試合ページのURLではありません: ${urlRaw}` };
  }

  const venue = venueRaw.trim();
  const stadium = venue === '' ? undefined : ctx.stadiums.find((s) => normalizeName(s.name) === normalizeName(venue));
  const competition = toHalfWidth(competitionRaw).trim();
  const round = toHalfWidth(roundRaw).trim();

  let id;
  try {
    id = buildFixtureId({
      seasonId: ctx.season.id, competition, round, matchDate: date.value, homeClubId: homeId, awayClubId: awayId,
    });
  } catch (e) {
    return { error: e.message };
  }
  return {
    value: {
      id,
      season_id: ctx.season.id,
      competition,
      round,
      match_date: date.value,
      kickoff: kickoff.value,
      home_club_id: homeId,
      away_club_id: awayId,
      venue_stadium_id: stadium ? stadium.id : null,
      venue_name_override: venue === '' || stadium ? null : venue,
      jleague_match_url: url,
    },
  };
}

// text：貼り付けた文字列。戻り値：{ ok: FixtureRow[], errors: [{ line, reason }] }（行番号は1始まりで見出し行も数える）
export function parseFixturesCsv(text, { season, clubs, stadiums = [] }) {
  const ctx = { season, stadiums, clubIndex: buildClubIndex(clubs) };
  const ok = [];
  const errors = [];
  const firstLineOf = new Map(); // 試合ID → 最初に出た行番号
  let seenNonEmpty = false;
  String(text ?? '').split(/\r\n|\r|\n/).forEach((line, i) => {
    if (line.trim() === '') return;
    const isFirstNonEmpty = !seenNonEmpty;
    seenNonEmpty = true;
    if (isFirstNonEmpty && toHalfWidth(line).trim().startsWith('日付')) return;
    const cells = line.split(line.includes('\t') ? '\t' : ',').map((c) => c.trim());
    const r = parseLine(cells, ctx);
    if (r.error) {
      errors.push({ line: i + 1, reason: r.error });
    } else if (firstLineOf.has(r.value.id)) {
      errors.push({ line: i + 1, reason: `同じ試合が ${firstLineOf.get(r.value.id)} 行目にもあります` });
    } else {
      firstLineOf.set(r.value.id, i + 1);
      ok.push(r.value);
    }
  });
  return { ok, errors };
}
