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

export function parseScheduleList(html) {
  for (const data of jsonLinesWith(html, 'scheduleList')) {
    const node = findNode(data, (o) => Array.isArray(o.scheduleList));
    if (!node) continue;
    const items = [];
    for (const group of node.scheduleList) {
      for (const sch of group?.schedules ?? []) {
        const date = dateFromMatchDate(sch?.matchDate);
        for (const m of sch?.matches ?? []) {
          const href = str(m?.detailHref);
          if (!date || !href || !m?.homeTeam || !m?.awayTeam) continue;
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
    return { items };
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
    const node = findNode(data, (o) => o.homeTeam && o.awayTeam);
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
