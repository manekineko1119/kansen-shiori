// 2つの Edge Function（sync-results・sync-videos）の受け付けの共通部分（設計書 6.2、段4 の最後のレビュー）。
// Deno 専用（Node のテストからは読まない）。オリジンの判定は _shared/edge-auth.js の純粋な関数で Node のテストがある
import { allowedOrigin, CORS_ALLOW_HEADERS } from '../_shared/edge-auth.js';

// 許すオリジンのときだけ Access-Control-Allow-Origin を付ける。応答はオリジンで変わるので Vary: Origin
export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = allowedOrigin(origin);
  const headers: Record<string, string> = { Vary: 'Origin' };
  if (allowed) {
    headers['Access-Control-Allow-Origin'] = allowed;
    headers['Access-Control-Allow-Headers'] = CORS_ALLOW_HEADERS;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
  }
  return headers;
}

// OPTIONS（ブラウザの事前の問い合わせ）なら 204 を返す。それ以外は null
export function preflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('Origin')) });
}

// JSON の応答（CORS のヘッダー付き）
export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req.headers.get('Origin')) },
  });
}
