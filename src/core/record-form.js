// 観戦記録の画面の判断（入力 ↔ 保存する値、試合の情報の検証、動画のサムネイル、費用の合計）。設計書 3.4.1・4.1・4.2、D30。通信しない純粋な関数
import { validateMatchRecord } from './validate.js';

export { validateMatchRecord };

export const COST_KEYS = ['cost_transport', 'cost_lodging', 'cost_ticket', 'cost_goods', 'cost_food'];
export const COST_LABELS = { cost_transport: '交通', cost_lodging: '宿', cost_ticket: 'チケット', cost_goods: 'グッズ', cost_food: '飲食' };
export const WATCH_LABELS = { stadium: '現地', broadcast: '中継', public_viewing: 'パブリックビューイング' };
export const STATUS_OPTIONS = { scheduled: '開催前', finished: '試合終了', postponed: '延期', cancelled: '試合中止' };
export const SCORER_TYPES = { goal: 'ゴール', penalty: 'PK', own_goal: 'オウンゴール' };
export const VIDEO_KINDS = { highlight: 'ハイライト', inside: 'INSIDE' };

const MINUTE = /^\d{1,3}(\+\d{1,2})?$/;
const VIDEO_PREFIXES = ['https://www.youtube.com/watch?v=', 'https://youtu.be/'];

// 全角の数字・カンマ・空白を半角にする
function toHalf(s) {
  return String(s).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[，、]/g, ',').replace(/[\s　]/g, '');
}

// 空は null、整数の文字列は数、それ以外は NaN（検証で止める）。'1,200'・'１，２００' は 1200
function toInt(v) {
  if (v === null || v === undefined) return null;
  const s = toHalf(v);
  if (s === '') return null;
  const t = s.replace(/,/g, '');
  return /^\d+$/.test(t) ? Number(t) : NaN;
}

const blankToNull = (v) => {
  const t = typeof v === 'string' ? v.trim() : '';
  return t === '' ? null : t;
};

export function recordFromForm(values) {
  const out = { watch_style: values.watch_style };
  for (const k of COST_KEYS) out[k] = toInt(values[k]);
  out.memo = blankToNull(values.memo);
  return out;
}

// 費用の合計。空・NaN は 0 として足さない
export function costTotal(record) {
  return COST_KEYS.reduce((sum, k) => sum + (Number.isFinite(record[k]) ? record[k] : 0), 0);
}

// 保存済みの記録 → 入力欄の初期値（数は文字列）。記録がなければ空（観戦方法は「現地」）
export function recordFormValues(record) {
  const out = { watch_style: record?.watch_style ?? 'stadium', memo: record?.memo ?? '' };
  for (const k of COST_KEYS) out[k] = record?.[k] == null ? '' : String(record[k]);
  return out;
}

// 得点者の行（scorer_<i>_side / _player / _minute / _type）。キーに出てくる最大の番号 + 1
function scorerRowCount(values) {
  let n = 0;
  for (const k of Object.keys(values)) {
    const m = /^scorer_(\d+)_/.exec(k);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return n;
}

// 名前が空でない行の、入力欄での番号（検証の errors の番号は、捨てたあとの番号。画面で元の行に戻すのに使う）
export function scorerRowIndexes(values) {
  const rows = [];
  for (let i = 0; i < scorerRowCount(values); i++) {
    if (String(values[`scorer_${i}_player`] ?? '').trim() !== '') rows.push(i);
  }
  return rows;
}

export function fixtureEditFromForm(values) {
  const scorers = scorerRowIndexes(values).map((i) => ({
    side: values[`scorer_${i}_side`],
    player: String(values[`scorer_${i}_player`]).trim(),
    minute: String(values[`scorer_${i}_minute`] ?? '').trim(),
    type: values[`scorer_${i}_type`] ?? 'goal',
  }));
  return {
    fixture: { status: values.status, home_score: toInt(values.home_score), away_score: toInt(values.away_score), scorers },
    videos: { highlight: blankToNull(values.video_highlight), inside: blankToNull(values.video_inside) },
  };
}

// 保存済みの試合 → 試合の情報の入力欄の初期値。得点者は club_id から側（home / away）に戻す。scorer_count は行の数
export function fixtureFormValues(fixture) {
  const videos = Object.fromEntries((fixture.fixture_videos ?? []).map((v) => [v.kind, v.url]));
  const out = {
    status: fixture.status ?? 'scheduled',
    home_score: fixture.home_score == null ? '' : String(fixture.home_score),
    away_score: fixture.away_score == null ? '' : String(fixture.away_score),
    video_highlight: videos.highlight ?? '',
    video_inside: videos.inside ?? '',
  };
  const scorers = fixture.scorers ?? [];
  scorers.forEach((s, i) => {
    out[`scorer_${i}_side`] = s.club_id === fixture.home_club_id ? 'home' : 'away';
    out[`scorer_${i}_player`] = s.player ?? '';
    out[`scorer_${i}_minute`] = s.minute ?? '';
    out[`scorer_${i}_type`] = s.type ?? 'goal';
  });
  out.scorer_count = String(scorers.length);
  return out;
}

const SCORER_FIELDS = ['side', 'player', 'minute', 'type'];

// i 行目を消して、後ろの行を詰める（scorer_count も1つ減らす）
export function removeScorerRow(values, i) {
  const n = Number(values.scorer_count ?? scorerRowCount(values));
  const out = { ...values };
  for (let r = i; r < n; r++) {
    for (const f of SCORER_FIELDS) {
      const next = values[`scorer_${r + 1}_${f}`];
      if (r + 1 < n && next !== undefined) out[`scorer_${r}_${f}`] = next;
      else delete out[`scorer_${r}_${f}`];
    }
  }
  out.scorer_count = String(Math.max(0, n - 1));
  return out;
}

// 画面に出す得点者の行。入力中の値（saved）に scorer_count があればそれだけで決める（消した DB の行を戻さない）。なければ DB の値
export function scorerRows(initial, saved) {
  const src = saved.scorer_count !== undefined ? saved : initial;
  const n = Number(src.scorer_count) || 0;
  return Array.from({ length: n }, (_, i) => ({
    side: src[`scorer_${i}_side`] ?? 'home',
    player: src[`scorer_${i}_player`] ?? '',
    minute: src[`scorer_${i}_minute`] ?? '',
    type: src[`scorer_${i}_type`] ?? 'goal',
  }));
}

// 空の行を末尾に足す（選手名・時間は必ず空で始まる）
export function addScorerRow(values) {
  const n = Number(values.scorer_count) || 0;
  return {
    ...values, scorer_count: String(n + 1),
    [`scorer_${n}_side`]: 'home', [`scorer_${n}_player`]: '', [`scorer_${n}_minute`]: '', [`scorer_${n}_type`]: 'goal',
  };
}

const isScore = (v) => Number.isInteger(v) && v >= 0;

export function validateFixtureEdit(edit, { homeClubId, awayClubId } = {}) {
  const errors = {};
  const f = edit.fixture;
  if (!Object.hasOwn(STATUS_OPTIONS, f.status)) errors.status = '状態を選んでください';
  for (const k of ['home_score', 'away_score']) {
    if (f[k] === null || f[k] === undefined) {
      if (f.status === 'finished') errors[k] = 'スコアを入力してください';
    } else if (!isScore(f[k])) {
      errors[k] = 'スコアは0以上の整数で入力してください';
    }
  }
  f.scorers.forEach((s, i) => {
    if (s.side !== 'home' && s.side !== 'away') errors[`scorers.${i}.side`] = 'ホームかアウェイを選んでください';
    if (!MINUTE.test(s.minute)) errors[`scorers.${i}.minute`] = '時間は 64 や 45+1 の形で入力してください';
    if (!Object.hasOwn(SCORER_TYPES, s.type)) errors[`scorers.${i}.type`] = '種類を選んでください';
  });
  if (f.scorers.length > 0 && (!homeClubId || !awayClubId)) errors._form = 'クラブが分からない試合の得点者は保存できません';
  for (const [kind, url] of Object.entries(edit.videos)) {
    if (url !== null && !VIDEO_PREFIXES.some((p) => url.startsWith(p))) {
      errors[`video_${kind}`] = 'YouTube の URL（https://www.youtube.com/watch?v= か https://youtu.be/ で始まるもの）を入力してください';
    }
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

// YouTube の URL から動画の ID を取り出す（watch?v= と youtu.be/）。取り出せなければ null（サムネイルなしでリンクだけ出す）
export function youtubeId(url) {
  let u;
  try {
    u = new URL(String(url));
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  let id = null;
  if (u.hostname === 'youtu.be') id = u.pathname.slice(1);
  else if (['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(u.hostname) && u.pathname === '/watch') id = u.searchParams.get('v');
  return id && /^[\w-]{1,32}$/.test(id) ? id : null;
}

export const thumbnailUrl = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

// 出どころの文（3.4.1）。結果の出どころが分からなければ null
export function sourceLabel(fixture) {
  if (fixture.result_source === 'manual') return '手入力';
  if (fixture.result_source === 'api') return 'Jリーグ公式から自動';
  return null;
}
