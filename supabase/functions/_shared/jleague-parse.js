// Jリーグ公式のページ（日程・結果の一覧、試合ページ）から試合結果を読み出す純粋な関数（設計書 5.10）。
// 通信はしない。Deno（Edge Function）と Node（テスト）の両方から読むため、標準の JavaScript だけを使う。
import { toHalfWidth, normalizeName } from './text.js';

const ORIGIN = 'https://www.jleague.jp';

// self.__next_f.push([1,"…"]) の文字列をすべて戻して、順につなげる
function extractPayload(html) {
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let text = '';
  for (const m of String(html ?? '').matchAll(re)) {
    try {
      text += JSON.parse(m[1]);
    } catch {
      // 読めない1つは飛ばす（他の部分で足りなければ呼び出し側が理由を返す）
    }
  }
  return text;
}

// key を含む行の、最初の ':' より後ろを JSON として読んだものを順に返す
function* jsonLinesWith(html, key) {
  for (const line of extractPayload(html).split('\n')) {
    if (!line.includes(`"${key}"`)) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    try {
      yield JSON.parse(line.slice(i + 1));
    } catch {
      // 次の行へ
    }
  }
}

// 入れ子をたどって、pred に合う最初のオブジェクトを返す
function findNode(node, pred) {
  if (node === null || typeof node !== 'object') return null;
  if (!Array.isArray(node) && pred(node)) return node;
  for (const v of Array.isArray(node) ? node : Object.values(node)) {
    const r = findNode(v, pred);
    if (r) return r;
  }
  return null;
}

const str = (v) => (typeof v === 'string' ? v : null);
const num = (v) => (Number.isInteger(v) ? v : null);

function undecided(v) {
  const s = str(v);
  return s === null || s === '' || s === '未定' ? null : s;
}

// "$D2026-10-25T00:00:00.000Z" → "2026-10-25"
function dateFromMatchDate(v) {
  const m = /^\$D(\d{4}-\d{2}-\d{2})T/.exec(str(v) ?? '');
  return m ? m[1] : null;
}

function team(t) {
  return { fullName: str(t?.fullName), name: str(t?.name), score: num(t?.score) };
}

// 試合ページの相対パス（外部のURLや別ページを matchUrl にしない）
const MATCH_HREF = /^\/match\/[a-z0-9]+\/\d{4}\/\d{6}\/?$/;

// 戻り値：{ items, skipped?, reason? }。skipped は detailHref が試合ページの形でなく飛ばした数で、1以上のときだけ付ける
export function parseScheduleList(html) {
  for (const data of jsonLinesWith(html, 'scheduleList')) {
    const node = findNode(data, (o) => Array.isArray(o.scheduleList));
    if (!node) continue;
    const items = [];
    let skipped = 0;
    for (const group of node.scheduleList) {
      for (const sch of group?.schedules ?? []) {
        const date = dateFromMatchDate(sch?.matchDate);
        for (const m of sch?.matches ?? []) {
          const href = str(m?.detailHref);
          if (!date || !href || !m?.homeTeam || !m?.awayTeam) continue;
          if (!MATCH_HREF.test(href)) { skipped += 1; continue; }
          const stadium = undecided(m.stadiumFullName);
          items.push({
            matchUrl: `${ORIGIN}${href.replace(/\/+$/, '')}/`,
            date,
            kickoff: undecided(m.time),
            state: str(m.state),
            home: team(m.homeTeam),
            away: team(m.awayTeam),
            stadiumName: stadium === null ? null : toHalfWidth(stadium),
          });
        }
      }
    }
    return skipped > 0 ? { items, skipped } : { items };
  }
  return { items: [], reason: '一覧ページに試合のデータが見つかりません' };
}

function readSide(t) {
  if (!t || !Array.isArray(t.playerScoreList) || !Number.isInteger(t.score)) return null;
  const scorers = [];
  for (const p of t.playerScoreList) {
    const minute = /^\s*([0-9]+(?:\+[0-9]+)?)/.exec(str(p?.scoreTime) ?? '')?.[1];
    if (!str(p?.name) || !minute) return null;
    scorers.push({ player: p.name, minute, type: p.ownGoal === true ? 'own_goal' : 'goal' });
  }
  return { score: t.score, scorers };
}

export function parseMatchPage(html) {
  for (const data of jsonLinesWith(html, 'playerScoreList')) {
    const node = findNode(data, (o) => Array.isArray(o.homeTeam?.playerScoreList) && Array.isArray(o.awayTeam?.playerScoreList));
    if (!node) continue;
    const home = readSide(node.homeTeam);
    const away = readSide(node.awayTeam);
    if (home && away) return { home, away };
  }
  return { reason: '試合ページに得点のデータが見つからないか、項目が足りません' };
}

// 得点者の数がスコアと合わないときは、得点者を空にして理由を返す（推測で埋めない）
export function buildScorers(page, { homeClubId, awayClubId }) {
  const sides = [[page?.home, homeClubId, 'ホーム'], [page?.away, awayClubId, 'アウェイ']];
  const scorers = [];
  for (const [side, clubId, label] of sides) {
    if (!side || !Array.isArray(side.scorers) || side.scorers.length !== side.score) {
      return { scorers: [], reason: `${label}の得点者の数がスコアと合いません` };
    }
    for (const s of side.scorers) {
      scorers.push({ club_id: clubId, player: s.player, minute: s.minute, type: s.type });
    }
  }
  return { scorers };
}

function clubNames(club) {
  return [club.name, club.short_name, ...(club.aliases ?? [])]
    .filter(Boolean).map(normalizeName);
}

function sideMatches(side, clubId, clubsById) {
  const club = clubsById.get(clubId);
  if (!club) return false;
  const names = clubNames(club);
  return [side?.fullName, side?.name].some((n) => n && names.includes(normalizeName(n)));
}

// 日付とホーム・アウェイが合う試合がちょうど1つのときだけ id を返す
export function matchFixture(item, fixtures, clubs) {
  const clubsById = new Map(clubs.map((c) => [c.id, c]));
  const hits = fixtures.filter((f) => f.match_date === item.date
    && sideMatches(item.home, f.home_club_id, clubsById)
    && sideMatches(item.away, f.away_club_id, clubsById));
  return hits.length === 1 ? hits[0].id : null;
}

export function clubSlugFromUrl(jleagueUrl) {
  return /\/club\/([^/?#]+)/.exec(jleagueUrl ?? '')?.[1] ?? null;
}

// 試合ページのURLを https://www.jleague.jp/match/{大会}/{年}/{6桁}/ にそろえる。合わなければ null
export function canonicalMatchPageUrl(input) {
  if (typeof input !== 'string') return null;
  let u;
  try {
    u = new URL(toHalfWidth(input).trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || (u.hostname !== 'www.jleague.jp' && u.hostname !== 'jleague.jp')) return null;
  const m = /^\/(?:sp\/)?match\/([a-z0-9-]+)\/(\d{4})\/(\d{6})(?:\/.*)?$/.exec(u.pathname);
  return m ? `${ORIGIN}/match/${m[1]}/${m[2]}/${m[3]}/` : null;
}

// "$D2026-09-09T10:00:00.000Z"（UTC）→ 日本時間の { date, kickoff }。00:00 は時刻未定として kickoff を null にする
function jstDateTime(v) {
  const m = /^\$D(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/.exec(str(v) ?? '');
  if (!m) return null;
  const t = Date.parse(`${m[1]}:00Z`);
  if (Number.isNaN(t)) return null;
  const iso = new Date(t + 9 * 3600 * 1000).toISOString();
  const time = iso.slice(11, 16);
  return { date: iso.slice(0, 10), kickoff: time === '00:00' ? null : time };
}

function detailSide(t, finished) {
  const read = finished ? readSide(t) : null;
  return {
    teamCode: str(t?.teamCode),
    name: str(t?.name),
    nameS: str(t?.nameS),
    score: read ? read.score : (finished ? num(t?.score) : null),
    scorers: read ? read.scorers : null,
  };
}

// 試合ページ1つから、大会・回戦・日時・会場・結果・PK戦を読む。読めなければ { reason }
export function parseMatchDetails(html) {
  for (const data of jsonLinesWith(html, 'tournament')) {
    const node = findNode(data, (o) => 'tournament' in o && 'section' in o);
    if (!node) continue;
    const when = jstDateTime(node.date);
    const tournament = str(node.tournament);
    if (!when || !tournament || !node.homeTeam || !node.awayTeam) continue;
    const finished = node.type === 'post-game';
    const home = detailSide(node.homeTeam, finished);
    const away = detailSide(node.awayTeam, finished);
    const ph = num(node.penalty?.homeTeamScore);
    const pa = num(node.penalty?.awayTeamScore);
    const hasPenalty = finished && ph !== null && pa !== null && (ph > 0 || pa > 0) && ph !== pa
      && home.score !== null && home.score === away.score;
    const stadium = undecided(node.stadium?.name);
    return {
      tournament,
      tournamentName: str(node.tournamentName),
      section: str(node.section),
      date: when.date,
      kickoff: when.kickoff,
      state: finished ? 'finished' : 'scheduled',
      type: str(node.type),
      stadiumName: stadium === null ? null : (toHalfWidth(stadium).trim() || null),
      home,
      away,
      penalty: hasPenalty ? { home: ph, away: pa } : null,
      canceledInfo: str(node.afterCanceledInfo) ?? '',
    };
  }
  return { reason: '試合ページに大会・回戦のデータが見つかりません' };
}
