// 試合ID（設計書 4.4）。
// 形式：`{シーズン}_{大会}_{節}_{ホームID}_{アウェイID}`（例：`2026-27_J3_26_matsumoto_nara`）
// 節がない試合は、節の部分に日付 `YYYYMMDD` を入れる。
// 一度決めたIDの形は変えない（観戦記録の紐づけに使う）。

const SEPARATOR = '_';

function assertPart(name, value) {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`試合IDの ${name} が空です`);
  }
  if (value.includes(SEPARATOR)) {
    throw new Error(`試合IDの ${name} に区切りの ${SEPARATOR} は使えません: ${value}`);
  }
}

// 'YYYY-MM-DD' → 'YYYYMMDD'
function compactDate(matchDate) {
  assertPart('試合日', matchDate);
  return matchDate.replace(/-/g, '');
}

export function buildFixtureId({ seasonId, competition, round, matchDate, homeClubId, awayClubId }) {
  const trimmedRound = typeof round === 'string' ? round.trim() : '';
  const roundOrDate = trimmedRound === '' ? compactDate(matchDate) : trimmedRound;
  assertPart('シーズン', seasonId);
  assertPart('大会', competition);
  assertPart('節', roundOrDate);
  assertPart('ホームID', homeClubId);
  assertPart('アウェイID', awayClubId);
  return [seasonId, competition, roundOrDate, homeClubId, awayClubId].join(SEPARATOR);
}

// 試合IDを部分に分ける。5つの部分に分けられない・空の部分があれば null
export function parseFixtureId(id) {
  if (typeof id !== 'string') return null;
  const parts = id.split(SEPARATOR);
  if (parts.length !== 5 || parts.some((part) => part === '')) return null;
  const [seasonId, competition, roundOrDate, homeClubId, awayClubId] = parts;
  return { seasonId, competition, roundOrDate, homeClubId, awayClubId };
}
