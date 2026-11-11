// 管理画面の保存（スタジアム・クラブ・シーズン・テスター。設計書 3.4・4.1・4.3）。書けるのは管理者だけ（守りは RLS と関数の中の is_admin()）
// 保存はどれも検証 → 保存。戻り値は遠征予定（trips.js）と同じ形：{ ok: true } | { ok: false, errors } | 'expired'
// 読み取り（テスター・取り込みの状況・写真の使用量）は { ok: true, ... } | { ok: false, message } | 'expired'
// メールアドレスはログに出さない（console に書かない）
import { validateStadium, validateClub, validateSeason, validateEmail } from '../core/validate.js';
import { toFormError, FORM_MESSAGES } from './errors.js';

const STADIUM_COLUMNS = ['id', 'name', 'prefecture', 'address', 'lat', 'lng', 'stations', 'airports', 'access_url', 'shuttle_note', 'parking_note', 'agoda_area', 'verified_at'];
// theme_colors は送らない（フェーズ2。上書きしないため）
const CLUB_COLUMNS = ['id', 'name', 'short_name', 'aliases', 'official_url', 'jleague_url', 'home_stadium_id', 'video_sources'];
const COMPETITION = 'J3';

const pickColumns = (obj, columns) => Object.fromEntries(columns.map((c) => [c, obj[c]]));

const fail = (e) => {
  const r = toFormError(e);
  return r === 'expired' ? 'expired' : { ok: false, errors: r };
};

const READ_FAILED = '読み込めませんでした。通信できる場所で開き直してください';
const RUN_OFFLINE = '取り込みを実行できませんでした。通信できる場所でもう一度押してください';

const readFail = (e) => {
  const r = toFormError(e);
  if (r === 'expired') return 'expired';
  return { ok: false, message: r._form === FORM_MESSAGES.forbidden ? r._form : READ_FAILED };
};

// 読み取り：Supabase の { data, error } → { ok: true, [key]: make(data) }。例外（通信できない）も失敗にする
async function read(promise, make) {
  try {
    const { data, error } = await promise;
    return error ? readFail(error) : { ok: true, ...make(data) };
  } catch (e) {
    return readFail(e);
  }
}

// Edge Function の失敗（supabase-js の FunctionsHttpError は context に Response を持つ）→ 'expired' | { ok: false, errors }
async function invokeFail(error) {
  const status = error?.context?.status;
  if (status === 401) return 'expired'; // ログインの期限切れ（管理者でない JWT も 401。管理者でない人はこの画面を開けない）
  if (error?.name !== 'FunctionsHttpError' || typeof status !== 'number') return { ok: false, errors: { _form: RUN_OFFLINE } };
  let message = null;
  try {
    const body = await error.context.json();
    if (typeof body?.message === 'string' && body.message !== '') message = body.message;
  } catch { /* 本文が JSON でない */ }
  return { ok: false, errors: { _form: message ?? `取り込みを実行できませんでした（${status}）` } };
}

export function createAdminStore({ client }) {
  // 検証 → 表に upsert（id が同じなら更新）
  async function saveRow(table, row, validation) {
    if (!validation.ok) return { ok: false, errors: validation.errors };
    try {
      const { error } = await client.from(table).upsert(row, { onConflict: 'id' });
      return error ? fail(error) : { ok: true };
    } catch (e) {
      return fail(e);
    }
  }

  // 所属クラブを clubIds に合わせる：足りない行だけ insert、余分な行だけ delete（全部消して入れ直さない）。ほかの大会の行は触らない
  async function syncSeasonClubs(seasonId, clubIds) {
    const { data, error } = await client.from('season_clubs').select('*').eq('season_id', seasonId).eq('competition', COMPETITION);
    if (error) return error;
    const have = new Set((data ?? []).map((r) => r.club_id));
    const want = new Set(clubIds);
    const add = [...want].filter((id) => !have.has(id));
    const drop = [...have].filter((id) => !want.has(id));
    if (add.length) {
      const res = await client.from('season_clubs').insert(add.map((club_id) => ({ season_id: seasonId, competition: COMPETITION, club_id })));
      if (res.error) return res.error;
    }
    if (drop.length) {
      const res = await client.from('season_clubs').delete().eq('season_id', seasonId).eq('competition', COMPETITION).in('club_id', drop);
      if (res.error) return res.error;
    }
    return null;
  }

  return {
    saveStadium: (stadium) => saveRow('stadiums', pickColumns(stadium, STADIUM_COLUMNS), validateStadium(stadium)),
    saveClub: (club) => saveRow('clubs', pickColumns(club, CLUB_COLUMNS), validateClub(club)),

    // is_current はここでは触らない（setCurrentSeason で切り替える）
    async saveSeason(season, clubIds) {
      const v = validateSeason(season);
      if (!v.ok) return { ok: false, errors: v.errors };
      try {
        const up = await client.from('seasons').upsert({ id: season.id, starts_on: season.starts_on, ends_on: season.ends_on }, { onConflict: 'id' });
        if (up.error) return fail(up.error);
        const error = await syncSeasonClubs(season.id, clubIds);
        return error ? fail(error) : { ok: true };
      } catch (e) {
        return fail(e);
      }
    },

    // 一意の索引（今のシーズンは1つだけ）のため、今の is_current を false → 選んだものを true の順。2回目が失敗したら1回目を戻す
    async setCurrentSeason(id) {
      if (typeof id !== 'string' || id.trim() === '') return { ok: false, errors: { id: 'シーズンを選んでください' } };
      let before;
      try {
        const first = await client.from('seasons').update({ is_current: false }).eq('is_current', true).select('id');
        if (first.error) return fail(first.error);
        before = (first.data ?? []).map((r) => r.id);
      } catch (e) {
        return fail(e);
      }
      let failure = null;
      try {
        const second = await client.from('seasons').update({ is_current: true }).eq('id', id).select('id');
        if (second.error) failure = second.error;
        else if ((second.data ?? []).length === 0) failure = { code: '22023', message: 'season not found' }; // 選んだシーズンがなかった
      } catch (e) {
        failure = e;
      }
      if (!failure) return { ok: true };
      for (const prev of before) {
        try {
          await client.from('seasons').update({ is_current: true }).eq('id', prev); // 戻せなくても、元の失敗を返す
        } catch { /* 通信できない */ }
      }
      return fail(failure);
    },

    // --- テスター（許可リスト。設計書 7.1、FR-33） ---
    loadTesters: () => read(client.rpc('admin_allowed_emails'), (rows) => ({ testers: rows ?? [] })),

    async addTester({ email, note }) {
      const v = validateEmail(email);
      if (!v.ok) return { ok: false, errors: v.errors };
      const memo = String(note ?? '').trim();
      try {
        const { error } = await client.from('allowed_emails').insert({ email: v.value, note: memo === '' ? null : memo });
        if (error?.code === '23505') return { ok: false, errors: { email: 'このメールアドレスはすでに登録されています' } };
        return error ? fail(error) : { ok: true };
      } catch (e) {
        return fail(e);
      }
    },

    // RLS で消せなかったとき、エラーにならず0行になるので、消えた行で確かめる
    async removeTester(email) {
      try {
        const { data, error } = await client.from('allowed_emails').delete().eq('email', email).select('email');
        if (error) return fail(error);
        return (data ?? []).length ? { ok: true } : { ok: false, errors: { _form: FORM_MESSAGES.forbidden } };
      } catch (e) {
        return fail(e);
      }
    },

    // --- 試合結果の取り込み（設計書 3.4・6.2、FR-52） ---
    // 今日（dayStartIso から）の results の行と、最新の results・videos の行。runs は新しい順で、今日の行がなければ最新の1行
    async loadSyncStatus(dayStartIso) {
      const runs = () => client.from('sync_runs').select('*');
      const today = await read(runs().eq('job', 'results').gte('ran_at', dayStartIso).order('ran_at', { ascending: false }), (rows) => ({ rows: rows ?? [] }));
      if (!today.ok) return today;
      const latest = await read(runs().eq('job', 'results').order('ran_at', { ascending: false }).limit(1), (rows) => ({ rows: rows ?? [] }));
      if (!latest.ok) return latest;
      const videos = await read(runs().eq('job', 'videos').order('ran_at', { ascending: false }).limit(1), (rows) => ({ rows: rows ?? [] }));
      if (!videos.ok) return videos;
      return { ok: true, runs: today.rows.length ? today.rows : latest.rows, videoLast: videos.rows[0] ?? null };
    },

    // 「今すぐ取り込む」：管理者のログインの JWT で sync-results を1回呼ぶ（1日の上限は Edge Function の予約が守る）
    async runSyncNow(clubId) {
      if (typeof clubId !== 'string' || clubId === '') return { ok: false, errors: { _form: '設定で応援クラブを選んでください' } };
      try {
        const { data, error } = await client.functions.invoke('sync-results', { body: { club_id: clubId } });
        if (error) return invokeFail(error);
        return { ok: true, result: { ok: data?.ok === true, message: data?.message ?? null, skippedReason: data?.skipped_reason ?? null } };
      } catch {
        return { ok: false, errors: { _form: RUN_OFFLINE } };
      }
    },

    // 得点者の取り込みに失敗した印を空に戻す（次の取り込みでもう一度読む）。RLS で書けなければ0行
    async clearScorersFailed(fixtureId) {
      try {
        const { data, error } = await client.from('fixtures').update({ scorers_failed_at: null }).eq('id', fixtureId).select('id');
        if (error) return fail(error);
        return (data ?? []).length ? { ok: true } : { ok: false, errors: { _form: FORM_MESSAGES.forbidden } };
      } catch (e) {
        return fail(e);
      }
    },

    // --- 写真の使用量（設計書 9章） ---
    loadPhotoUsage: () => read(client.rpc('admin_photo_usage'), (bytes) => ({ bytes: Number(bytes ?? 0) })),
  };
}
