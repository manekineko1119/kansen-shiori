// 管理画面の日程（設計書 3.4・4.4・5.5、FR-42・43）。1件の入力 → 保存する値、貼り付けの取り込みの振り分け。純粋な関数だけ
// admin-form.js（スタジアム・クラブ）が 300 行に近いので、日程はこのファイルに分けた
import { buildFixtureId, normalizeCompetition, normalizeRound } from './fixture-id.js';
import { validateFixture } from './validate.js';
import { normalizeJleagueMatchUrl } from './links/jleague.js';
import { toHalfWidth } from '../../supabase/functions/_shared/text.js';

const text = (v) => String(v ?? '').trim();
const blankToNull = (v) => (text(v) === '' ? null : text(v));
const str = (v) => (v === null || v === undefined ? '' : String(v));

// 管理画面で選べる状態（終わった試合の結果は観戦記録の画面で直す）
export const EDITABLE_STATUSES = ['scheduled', 'postponed', 'cancelled'];

// キックオフ：空・未定は null、H:MM は HH:MM。読めない文字はそのまま返して検証で止める
function kickoffFromForm(v) {
  const s = toHalfWidth(v).trim();
  if (s === '' || s === '未定') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : s;
}

// 試合ページの URL：空は null、読めればそろえた形、読めなければ入力のまま（検証で止める）
function matchUrlFromForm(v) {
  const s = toHalfWidth(v).trim();
  if (s === '') return null;
  return normalizeJleagueMatchUrl(s) ?? s;
}

/**
 * 1件の入力 → fixtures の行。values.id があれば（編集）その ID のまま変えない（4.4）。
 * 新しい試合は buildFixtureId で作り、作れなければ id を空にする（validateFixtureForm が理由を出す）。
 * status は入力欄があるときだけ入れる（ないときは送らず、今の状態・結果を残す）
 */
export function fixtureFromForm(values, { seasonId }) {
  const competition = normalizeCompetition(text(values.competition));
  const roundText = normalizeRound(text(values.round));
  const matchDate = toHalfWidth(values.match_date).trim();
  const home = text(values.home_club_id);
  const away = text(values.away_club_id);
  let id = text(values.id);
  if (id === '') {
    try {
      id = buildFixtureId({ seasonId, competition, round: roundText, matchDate, homeClubId: home, awayClubId: away });
    } catch {
      id = '';
    }
  }
  const out = {
    id, season_id: seasonId, competition, round: roundText === '' ? null : roundText, match_date: matchDate,
    kickoff: kickoffFromForm(values.kickoff),
    home_club_id: home, away_club_id: away,
    venue_stadium_id: blankToNull(values.venue_stadium_id), venue_name_override: blankToNull(values.venue_name_override),
    jleague_match_url: matchUrlFromForm(values.jleague_match_url),
  };
  if (values.status !== undefined && text(values.status) !== '') out.status = text(values.status);
  return out;
}

/** 登録済みの試合 → 入力欄の値 */
export function fixtureToValues(f) {
  return {
    id: str(f.id), competition: str(f.competition), round: str(f.round), match_date: str(f.match_date), kickoff: str(f.kickoff),
    home_club_id: str(f.home_club_id), away_club_id: str(f.away_club_id),
    venue_stadium_id: str(f.venue_stadium_id), venue_name_override: str(f.venue_name_override),
    jleague_match_url: str(f.jleague_match_url), status: str(f.status),
  };
}

/** validateFixture（日付・キックオフ・クラブ）に、大会・会場・試合ページ・状態・ID の検査を足す */
export function validateFixtureForm(f, clubIds) {
  const errors = { ...validateFixture(f, clubIds).errors };
  if (text(f.competition) === '') errors.competition = '大会を入力してください';
  if (f.venue_stadium_id && f.venue_name_override) errors.venue_name_override = 'スタジアムを選んだときは、会場の名前は空にしてください';
  if (f.jleague_match_url !== null && normalizeJleagueMatchUrl(f.jleague_match_url) !== f.jleague_match_url) {
    errors.jleague_match_url = 'Jリーグ公式の試合ページの URL（https://www.jleague.jp/match/…）を入れてください';
  }
  if ('status' in f && !EDITABLE_STATUSES.includes(f.status)) errors.status = '状態を選んでください';
  if (f.id === '' && Object.keys(errors).length === 0) errors._form = '試合IDを作れませんでした（大会・節に「_」は使えません）';
  return { ok: Object.keys(errors).length === 0, errors };
}

// 上書きのときに送らない列（取り込んだ結果・得点者を消さない。6.2）
const RESULT_COLUMNS = ['status', 'home_score', 'away_score', 'scorers', 'result_source', 'scorers_fetched_at', 'scorers_failed_at', 'result_updated_at'];

function forUpdate(row) {
  const out = { ...row };
  for (const k of RESULT_COLUMNS) delete out[k];
  // 試合ページの URL が空の行は送らない（自動の取り込みが一覧ページから入れた URL を消さない）
  if (out.jleague_match_url == null) delete out.jleague_match_url;
  return out;
}

/**
 * parseFixturesCsv の結果 → 新しい試合（insert）と上書きする試合（update）。errors はそのまま。
 * existing：そのシーズンの登録済みの試合（id・competition・round・match_date・home_club_id・away_club_id）。
 * 節のない試合は ID に日付が入る（4.4）ので、日付が変わると別の ID になる。同じ大会・対戦の節のない試合が
 * 別の日付で登録済みなら、新しい試合にせず理由つきのエラーにする（重複を作らず、観戦記録のつながりを保つ）
 */
export function importPlan(parsed, existing) {
  const ids = new Set(existing.map((f) => f.id));
  const roundless = (f) => f.round == null || f.round === '';
  const sameCard = (a, b) => a.competition === b.competition && a.home_club_id === b.home_club_id && a.away_club_id === b.away_club_id;
  const insert = [];
  const update = [];
  const errors = [...parsed.errors];
  for (const row of parsed.ok) {
    if (ids.has(row.id)) { update.push(forUpdate(row)); continue; }
    const moved = roundless(row) ? existing.find((f) => roundless(f) && sameCard(f, row) && f.match_date !== row.match_date) : undefined;
    if (moved) {
      errors.push({ line: null, reason: `${row.match_date} ${row.home_club_id} vs ${row.away_club_id}：同じ大会・対戦の節のない試合が ${moved.match_date} に登録済みです。日付が変わったときは、その試合を1件の編集で直してください（試合ID ${moved.id} はそのまま）` });
      continue;
    }
    insert.push(row);
  }
  return { insert, update, errors };
}
