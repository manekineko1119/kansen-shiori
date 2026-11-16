// 試合ページの URL から事実を1回読む入口（設計書 6.2）。管理者だけが呼べる（cron からは呼べない）。
// 受け付けと supabase-js の準備だけを行い、処理は run.js に任せる
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { authorizeCaller, pickSecretKey } from '../_shared/edge-auth.js';
import { json, preflight } from '../_lib/http.ts';
import { runImportMatch } from './run.js';

const USER_AGENT = 'kansen-shiori (+https://github.com/manekineko1119/kansen-shiori)';
// 相手が応答しないとき、20秒で読むのをやめる。転送はたどらず、3xx は 200 以外として失敗にする
const FETCH_TIMEOUT_MS = 20000;

function check<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data;
}

function makeDb(supabase: ReturnType<typeof createClient>) {
  return {
    // 回数の予約。予約できなければ null
    reserveMatchPage: async (args: { dayStartIso: string; pagesLimit: number }) =>
      check(await supabase.rpc('sync_reserve_match_page', { p_day_start: args.dayStartIso, p_pages_limit: args.pagesLimit })),
    finishRun: async (runId: number, row: { ok: boolean; message: string | null; list_read: number; pages_read: number }) =>
      check(await supabase.rpc('sync_finish_run', { p_run_id: runId, p_ok: row.ok, p_message: row.message, p_list_read: row.list_read, p_pages_read: row.pages_read })),
  };
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (res.status !== 200) throw new Error(`Jリーグ公式の応答が ${res.status}`);
  return await res.text();
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json(req, { ok: false, message: 'POST だけ受け付けます' }, 405);
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, pickSecretKey(Deno.env)!, { auth: { persistSession: false } });

  const token = /^Bearer (.+)$/.exec(req.headers.get('Authorization') ?? '')?.[1];
  let user = null;
  if (token) {
    const { data, error } = await supabase.auth.getUser(token);
    if (!error) user = data.user;
  }
  // 管理者のログインだけ通す（cron の合言葉は受け付けない）
  if (authorizeCaller({ headerSecret: null, cronSecret: undefined, user }) !== 'admin') {
    return json(req, { ok: false, message: '認証できません' }, 401);
  }

  const body = await req.json().catch(() => null);
  const url = typeof body?.url === 'string' ? body.url : '';

  try {
    const result = await runImportMatch({ db: makeDb(supabase), fetchText, nowMs: Date.now(), url });
    return json(req, result, !result.ok && result.reason === 'url' ? 400 : 200);
  } catch (e) {
    return json(req, { ok: false, message: `記録できませんでした：${(e as Error).message}` }, 500);
  }
});
