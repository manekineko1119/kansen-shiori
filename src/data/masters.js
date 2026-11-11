// 共通データ（クラブ・スタジアム・日程）。スナップショットで先に出し、裏で最新を取る（設計書 4.5・9章）
import { SNAPSHOT_KEYS, offlineLabel } from './snapshot.js';

const FIRST_TIME_MESSAGE = '初回は通信できる場所で開いてください';

// kickoff を 'HH:MM' に（D27）。null は null
export function normalizeFixtureRow(row) {
  return { ...row, kickoff: row.kickoff == null ? null : String(row.kickoff).slice(0, 5) };
}

// 形が合わない（壊れた）スナップショットは null（設計書 4.5）
export async function readMastersSnapshot(snapshot) {
  const v = await snapshot.load(SNAPSHOT_KEYS.masters);
  const d = v?.data;
  const ok = d && ['clubs', 'stadiums', 'seasonClubs', 'fixtures'].every((k) => Array.isArray(d[k]));
  return ok ? v : null;
}

function check({ data, error }) {
  if (error) throw new Error(error.message ?? 'error');
  return data;
}

async function fetchMasters(client) {
  const season = check(await client.from('seasons').select('*').eq('is_current', true).maybeSingle());
  const [clubs, stadiums] = await Promise.all([
    client.from('clubs').select('*').order('id').then(check),
    client.from('stadiums').select('*').order('id').then(check),
  ]);
  let seasonClubs = [];
  let fixtures = [];
  if (season) {
    seasonClubs = check(await client.from('season_clubs').select('*').eq('season_id', season.id));
    const rows = check(await client.from('fixtures').select('*, fixture_videos(*)').eq('season_id', season.id).order('match_date'));
    fixtures = rows.map(normalizeFixtureRow);
  }
  return { season: season ?? null, clubs, stadiums, seasonClubs, fixtures };
}

export async function refreshMasters({ client, snapshot, nowMs }) {
  try {
    const data = await fetchMasters(client);
    try {
      await snapshot.save(SNAPSHOT_KEYS.masters, data, nowMs);
    } catch (e) {
      console.warn('共通データを端末に保存できませんでした', e); // 保存の失敗では最新を捨てない
    }
    return { status: 'fresh', data };
  } catch {
    const old = await readMastersSnapshot(snapshot);
    if (old) return { status: 'offline', data: old.data, label: offlineLabel(old.savedAt) };
    return { status: 'unavailable', message: FIRST_TIME_MESSAGE };
  }
}

// 今のシーズン以外の試合を ID で読む（D28）
export async function fetchFixturesByIds({ client }, ids) {
  if (ids.length === 0) return [];
  const rows = check(await client.from('fixtures').select('*, fixture_videos(*)').in('id', ids));
  return rows.map(normalizeFixtureRow);
}

// 今のシーズン以外のシーズンの試合を season_id で読む（観戦記録の一覧。設計書 3.4.2）
export async function fetchSeasonFixtures({ client }, seasonId) {
  const rows = check(await client.from('fixtures').select('*').eq('season_id', seasonId).order('match_date'));
  return rows.map(normalizeFixtureRow);
}

// シーズンの選択肢。新しい順
export async function fetchSeasons({ client }) {
  return check(await client.from('seasons').select('id, starts_on, ends_on, is_current').order('starts_on', { ascending: false }));
}
