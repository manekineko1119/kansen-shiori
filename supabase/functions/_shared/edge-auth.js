// Edge Function の鍵の選び方・呼び出し元の確認・日本時間の「今日」（設計書 6.2、D16）。
// Edge Function と Node のテストの両方から読むため、通信をしない純粋な関数だけを置く。

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const nonEmpty = (v) => (typeof v === 'string' && v !== '' ? v : null);

// DB を操作する鍵：SUPABASE_SECRET_KEYS（JSON）の default を優先し、なければ従来の SUPABASE_SERVICE_ROLE_KEY
export function pickSecretKey(env) {
  const raw = env.get('SUPABASE_SECRET_KEYS');
  if (raw) {
    try {
      const key = nonEmpty(JSON.parse(raw)?.default);
      if (key) return key;
    } catch {
      // 読めなければ従来の鍵に戻る
    }
  }
  return nonEmpty(env.get('SUPABASE_SERVICE_ROLE_KEY'));
}

// 合言葉の比較：長さが違えば false、同じ長さなら途中で抜けずに全文字を比べる
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// 呼び出し元：'cron'（合言葉が一致）、'admin'（管理者のログイン）、どちらでもなければ null
export function authorizeCaller({ headerSecret, cronSecret, user }) {
  if (nonEmpty(cronSecret) && typeof headerSecret === 'string' && safeEqual(headerSecret, cronSecret)) return 'cron';
  if (user?.app_metadata?.role === 'admin') return 'admin';
  return null;
}

// 日本時間のその日の 0 時（UTC の ISO 文字列）
export function jstDayStartIso(nowMs) {
  const jstMs = nowMs + JST_OFFSET_MS;
  const startJst = jstMs - (((jstMs % DAY_MS) + DAY_MS) % DAY_MS);
  return new Date(startJst - JST_OFFSET_MS).toISOString();
}

// 日本時間の今日（'YYYY-MM-DD'）
export function jstToday(nowMs) {
  return new Date(nowMs + JST_OFFSET_MS).toISOString().slice(0, 10);
}

// 取り込むクラブの ID（club_id）の形：小文字の英数字とハイフンだけ（PostgREST の or() の文字列に入れるため）
export function isClubId(value) {
  return typeof value === 'string' && /^[a-z0-9-]+$/.test(value);
}

// ブラウザから呼べるオリジン（GitHub Pages と、ローカルの確認の 8080 番。設計書 6.2）
const ALLOWED_ORIGINS = ['https://manekineko1119.github.io', 'http://localhost:8080'];

// CORS で許すリクエストヘッダー。x-cron-secret は pg_cron（サーバー）だけが使うので入れない
export const CORS_ALLOW_HEADERS = 'authorization, content-type, x-client-info, apikey';

// 許すオリジンならそのまま、そうでなければ null（完全一致だけ）
export function allowedOrigin(origin) {
  return typeof origin === 'string' && ALLOWED_ORIGINS.includes(origin) ? origin : null;
}
