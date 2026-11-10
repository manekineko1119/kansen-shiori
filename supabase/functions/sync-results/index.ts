// 試合結果の取り込みの入口（設計書 6.2、D14・D16）。受け付けと supabase-js の準備だけを行い、処理は run.js に任せる
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { authorizeCaller, pickSecretKey } from '../_shared/edge-auth.js';
import { runSyncResults } from './run.js';

const USER_AGENT = 'kansen-shiori (+https://github.com/manekineko1119/kansen-shiori)';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

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
    runsSince: async (isoStart: string) =>
      check(await supabase.from('sync_runs').select('job, list_read, pages_read').gte('ran_at', isoStart)),
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
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (res.status !== 200) throw new Error(`Jリーグ公式の応答が ${res.status}`);
  return await res.text();
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, message: 'POST だけ受け付けます' }, 405);
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, pickSecretKey(Deno.env)!, { auth: { persistSession: false } });

  // 管理者のログインの JWT（なければ・確かめられなければ user = null）
  const token = /^Bearer (.+)$/.exec(req.headers.get('Authorization') ?? '')?.[1];
  let user = null;
  if (token) {
    const { data, error } = await supabase.auth.getUser(token);
    if (!error) user = data.user;
  }
  const caller = authorizeCaller({ headerSecret: req.headers.get('x-cron-secret'), cronSecret: Deno.env.get('CRON_SECRET'), user });
  if (caller === null) return json({ ok: false, message: '認証できません' }, 401);

  const body = await req.json().catch(() => null);
  const clubId = typeof body?.club_id === 'string' ? body.club_id : '';
  if (clubId === '') return json({ ok: false, message: 'club_id が必要です' }, 400);

  try {
    const result = await runSyncResults({ db: makeDb(supabase), fetchText, sleep: (ms: number) => new Promise((r) => setTimeout(r, ms)), nowMs: Date.now(), clubId });
    return json({ ok: result.ok, message: result.message });
  } catch (e) {
    return json({ ok: false, message: `記録できませんでした：${(e as Error).message}` }, 500);
  }
});
