// 試合結果の取り込みの入口（設計書 6.2、D14・D16）。受け付けと supabase-js の準備だけを行い、処理は run.js に任せる
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { authorizeCaller, pickSecretKey, isClubId } from '../_shared/edge-auth.js';
import { json, preflight } from '../_lib/http.ts';
import { runSyncResults } from './run.js';

const USER_AGENT = 'kansen-shiori (+https://github.com/manekineko1119/kansen-shiori)';
// 相手が応答しないとき、20秒で読むのをやめる（設計書 6.2）。転送はたどらず、3xx は 200 以外として失敗にする（読むのは決めたページだけ）
const FETCH_TIMEOUT_MS = 20000;

// supabase-js のエラーは投げる（run.js の try/finally が ok: false で記録する）
function check<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data;
}

function makeDb(supabase: ReturnType<typeof createClient>) {
  return {
    currentSeason: async () =>
      check(await supabase.from('seasons').select('id, starts_on').eq('is_current', true).maybeSingle()),
    club: async (id: string) =>
      check(await supabase.from('clubs').select('id, jleague_url').eq('id', id).maybeSingle()),
    competitionOf: async (seasonId: string, clubId: string) =>
      check(await supabase.from('season_clubs').select('competition').eq('season_id', seasonId).eq('club_id', clubId).maybeSingle())?.competition ?? null,
    // 回数の予約（D21）。予約できなければ null
    reserveRun: async (args: { dayStartIso: string; listLimit: number; pagesLimit: number; pagesPerRun: number }) => {
      const rows = check(await supabase.rpc('sync_reserve_run', {
        p_job: 'results',
        p_day_start: args.dayStartIso,
        p_list_limit: args.listLimit,
        p_pages_limit: args.pagesLimit,
        p_pages_per_run: args.pagesPerRun,
      }));
      const row = Array.isArray(rows) ? rows[0] : null;
      return row ? { runId: row.run_id, pagesAllowed: row.pages_allowed } : null;
    },
    // 予約が0行だったときの理由（'running' か 'limit'）
    skipReason: async () =>
      check(await supabase.rpc('sync_skip_reason', { p_job: 'results' })),
    finishRun: async (runId: number, row: { ok: boolean; message: string | null; list_read: number; pages_read: number }) =>
      check(await supabase.rpc('sync_finish_run', { p_run_id: runId, p_ok: row.ok, p_message: row.message, p_list_read: row.list_read, p_pages_read: row.pages_read })),
    fixturesOf: async (seasonId: string, clubId: string) =>
      check(await supabase.from('fixtures')
        .select('id, match_date, home_club_id, away_club_id, status, home_score, away_score, result_source, scorers_fetched_at, scorers_failed_at, jleague_match_url')
        .eq('season_id', seasonId)
        .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)),
    clubs: async () =>
      check(await supabase.from('clubs').select('id, name, short_name, aliases')),
    applyResult: async (id: string, patch: unknown) =>
      check(await supabase.rpc('sync_apply_result', { p_id: id, p_patch: patch })),
    applyScorers: async (id: string, scorers: unknown) =>
      check(await supabase.rpc('sync_apply_scorers', { p_id: id, p_scorers: scorers })),
    insertRun: async (row: unknown) => {
      check(await supabase.from('sync_runs').insert(row));
    },
  };
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (res.status !== 200) throw new Error(`Jリーグ公式の応答が ${res.status}`);
  return await res.text();
}

Deno.serve(async (req: Request) => {
  // ブラウザ（管理画面の「今すぐ取り込む」）の事前の問い合わせ
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json(req, { ok: false, message: 'POST だけ受け付けます' }, 405);
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, pickSecretKey(Deno.env)!, { auth: { persistSession: false } });

  // 管理者のログインの JWT（なければ・確かめられなければ user = null）
  const token = /^Bearer (.+)$/.exec(req.headers.get('Authorization') ?? '')?.[1];
  let user = null;
  if (token) {
    const { data, error } = await supabase.auth.getUser(token);
    if (!error) user = data.user;
  }
  const caller = authorizeCaller({ headerSecret: req.headers.get('x-cron-secret'), cronSecret: Deno.env.get('CRON_SECRET'), user });
  if (caller === null) return json(req, { ok: false, message: '認証できません' }, 401);

  const body = await req.json().catch(() => null);
  const clubId = typeof body?.club_id === 'string' ? body.club_id : '';
  if (clubId === '') return json(req, { ok: false, message: 'club_id が必要です' }, 400);
  // PostgREST の or() の文字列に入れるので、形を確かめる
  if (!isClubId(clubId)) return json(req, { ok: false, message: 'club_id の形が正しくありません' }, 400);

  try {
    const result = await runSyncResults({ db: makeDb(supabase), fetchText, sleep: (ms: number) => new Promise((r) => setTimeout(r, ms)), nowMs: Date.now(), clubId });
    return json(req, { ok: result.ok, message: result.message, skipped_reason: result.skipped_reason });
  } catch (e) {
    return json(req, { ok: false, message: `記録できませんでした：${(e as Error).message}` }, 500);
  }
});
