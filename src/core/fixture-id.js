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

// 節を文字列にする。null・undefined・空白だけは「節なし」（空文字を返す）。
// 文字列と数字は受け付ける。それ以外の型は例外。
function normalizeRound(round) {
  if (round == null) return '';
  if (typeof round === 'string') return round.trim();
  if (typeof round === 'number' && Number.isFinite(round)) return String(round);
  throw new Error(`試合IDの節の型が正しくありません: ${typeof round}`);
}

// 'YYYY-MM-DD' → 'YYYYMMDD'（形が違えば例外）
function compactDate(matchDate) {
  if (typeof matchDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(matchDate)) {
    throw new Error(`試合日は YYYY-MM-DD の形で指定してください: ${matchDate}`);
  }
  return matchDate.replace(/-/g, '');
}

export function buildFixtureId({ seasonId, competition, round, matchDate, homeClubId, awayClubId }) {
  const trimmedRound = normalizeRound(round);
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
