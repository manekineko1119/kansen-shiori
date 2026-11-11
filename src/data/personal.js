// 個人データ（遠征予定・観戦記録）。読んで、端末の写し personal:<ユーザーID> に保存する（設計書 4.5・9章、D28・D33）
import { SNAPSHOT_KEYS, offlineLabel } from './snapshot.js';
import { fetchFixturesByIds } from './masters.js';

const FIRST_TIME_MESSAGE = '初回は通信できる場所で開いてください';

// 形が合わない（壊れた）写しは null
export async function readPersonalSnapshot(snapshot, userId) {
  const v = await snapshot.load(SNAPSHOT_KEYS.personal(userId));
  const d = v?.data;
  const ok = d && ['trips', 'records', 'extraFixtures'].every((k) => Array.isArray(d[k]));
  return ok ? v : null;
}

function check({ data, error }) {
  if (error) throw new Error(error.message ?? 'error');
  return data;
}

async function fetchPersonal(client, knownFixtureIds) {
  const [trips, records] = await Promise.all([
    client.from('trips').select('*').then(check),
    client.from('match_records').select('*').then(check),
  ]);
  // 今のシーズンにない試合だけを ID で読む（D28）
  const missing = [...new Set([...trips, ...records].map((r) => r.fixture_id).filter((id) => id != null && !knownFixtureIds.has(id)))];
  const extraFixtures = await fetchFixturesByIds({ client }, missing);
  return { trips, records, extraFixtures };
}

export async function refreshPersonal({ client, snapshot, userId, nowMs, knownFixtureIds }) {
  try {
    const data = await fetchPersonal(client, knownFixtureIds);
    try {
      await snapshot.save(SNAPSHOT_KEYS.personal(userId), data, nowMs);
    } catch (e) {
      console.warn('遠征予定・観戦記録を端末に保存できませんでした', e); // 保存の失敗では最新を捨てない
    }
    return { status: 'fresh', data };
  } catch {
    const old = await readPersonalSnapshot(snapshot, userId);
    if (old) return { status: 'offline', data: old.data, label: offlineLabel(old.savedAt) };
    return { status: 'unavailable', message: FIRST_TIME_MESSAGE };
  }
}
