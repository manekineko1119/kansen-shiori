// 管理画面の保存（スタジアム・クラブ・シーズン。設計書 3.4・4.1・4.3）。書けるのは管理者だけ（守りは RLS）
// どれも検証 → 保存。戻り値は遠征予定（trips.js）と同じ形：{ ok: true } | { ok: false, errors } | 'expired'
import { validateStadium, validateClub, validateSeason } from '../core/validate.js';
import { toFormError } from './errors.js';

const STADIUM_COLUMNS = ['id', 'name', 'prefecture', 'address', 'lat', 'lng', 'stations', 'airports', 'access_url', 'shuttle_note', 'parking_note', 'agoda_area', 'verified_at'];
// theme_colors は送らない（フェーズ2。上書きしないため）
const CLUB_COLUMNS = ['id', 'name', 'short_name', 'aliases', 'official_url', 'jleague_url', 'home_stadium_id', 'video_sources'];
const COMPETITION = 'J3';

const pickColumns = (obj, columns) => Object.fromEntries(columns.map((c) => [c, obj[c]]));

const fail = (e) => {
  const r = toFormError(e);
  return r === 'expired' ? 'expired' : { ok: false, errors: r };
};

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
  };
}
