// 試合動画の登録の入口（設計書 6.3、D14・D16）。受け付けと supabase-js の準備だけを行い、処理は run.js に任せる
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { authorizeCaller, pickSecretKey } from '../_shared/edge-auth.js';
import { runSyncVideos } from './run.js';

// 相手が応答しないとき、20秒で読むのをやめる（設計書 6.2）。転送はたどらず、3xx は 200 以外として失敗にする（読むのは決めたページだけ）
const FETCH_TIMEOUT_MS = 20000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// supabase-js のエラーは投げる（run.js が ok: false で記録する）
function check<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data;
}

function makeDb(supabase: ReturnType<typeof createClient>) {
  return {
    club: async (id: string) =>
      check(await supabase.from('clubs').select('id, video_sources').eq('id', id).maybeSingle()),
    saveVideoSources: async (clubId: string, sources: unknown) => {
      check(await supabase.from('clubs').update({ video_sources: sources }).eq('id', clubId));
    },
    fixturesBetween: async (clubId: string, fromDate: string, toDate: string) =>
      check(await supabase.from('fixtures')
        .select('id, match_date, round, home_club_id, away_club_id')
        .gte('match_date', fromDate)
        .lte('match_date', toDate)
        .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)),
    clubs: async () =>
      check(await supabase.from('clubs').select('id, name, short_name, aliases')),
    videosOf: async (fixtureIds: string[]) => {
      if (fixtureIds.length === 0) return [];
      return check(await supabase.from('fixture_videos').select('fixture_id, kind, source').in('fixture_id', fixtureIds));
    },
    upsertVideo: async (row: unknown) =>
      check(await supabase.rpc('sync_upsert_video', { p_row: row })),
    insertRun: async (row: unknown) => {
      check(await supabase.from('sync_runs').insert(row));
    },
  };
}

// 状態コードだけをエラーに入れる（URL に APIキーが入っているため）
async function getJson(url: string) {
  let res: Response;
  try {
    res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch {
    // 元の例外の文には URL（APIキー）が入りうるので使わない
    throw new Error('YouTube API に接続できません');
  }
  if (res.status !== 200) throw new Error(`YouTube API の応答が ${res.status}`);
  return await res.json();
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
    const result = await runSyncVideos({
      db: makeDb(supabase), getJson, nowMs: Date.now(), clubId, apiKey: Deno.env.get('YOUTUBE_API_KEY') ?? '',
    });
    return json({ ok: result.ok, message: result.message });
  } catch (e) {
    return json({ ok: false, message: `記録できませんでした：${(e as Error).message}` }, 500);
  }
});
