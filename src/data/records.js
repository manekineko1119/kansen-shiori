// 観戦記録・試合の情報の保存（設計書 4.1・4.2・9章）。user_id・visibility は送らない（DB の既定値）。失敗の理由は toFormError（D34）
import { validateMatchRecord, validateFixtureEdit, COST_KEYS } from '../core/record-form.js';
import { toFormError, FORM_MESSAGES } from './errors.js';

const fail = (e) => {
  const r = toFormError(e);
  return r === 'expired' ? 'expired' : { ok: false, errors: r };
};

// photo_path はここでは送らない（写真は別の保存。送ると既存の写真を消してしまう）
function recordRow(record) {
  const row = {
    fixture_id: record.fixture_id,
    trip_id: record.trip_id ?? null,
    watch_style: record.watch_style,
    memo: record.memo ?? null,
  };
  for (const k of COST_KEYS) row[k] = record[k] ?? null;
  return row;
}

export function createRecordStore({ client }) {
  // 手入力で保存する動画（種類ごと）。URL があれば upsert、空なら手入力の行だけ消す（自動の動画は消さない）
  async function saveVideo(fixtureId, kind, url) {
    const q = url
      ? client.from('fixture_videos').upsert({ fixture_id: fixtureId, kind, url, source: 'manual' }, { onConflict: 'fixture_id,kind' })
      : client.from('fixture_videos').delete().eq('fixture_id', fixtureId).eq('kind', kind).eq('source', 'manual');
    return q;
  }

  return {
    async save(record) {
      const v = validateMatchRecord(record);
      if (!v.ok) return { ok: false, errors: v.errors };
      try {
        const { data, error } = await client.from('match_records').upsert(recordRow(record), { onConflict: 'user_id,fixture_id' }).select().single();
        if (error) return fail(error);
        return { ok: true, id: data?.id };
      } catch (e) {
        return fail(e);
      }
    },
    async remove(id) {
      try {
        const { error } = await client.from('match_records').delete().eq('id', id);
        if (error) return fail(error);
        return { ok: true };
      } catch (e) {
        return fail(e);
      }
    },
    // 管理者だけ（RLS）。保存すると result_source は 'manual' になり、自動の取り込みで上書きされない
    async saveFixtureInfo(fixtureId, edit, { homeClubId, awayClubId }) {
      const v = validateFixtureEdit(edit, { homeClubId, awayClubId });
      if (!v.ok) return { ok: false, errors: v.errors };
      const f = edit.fixture;
      const values = {
        status: f.status,
        home_score: f.home_score,
        away_score: f.away_score,
        scorers: f.scorers.map((s) => ({ club_id: s.side === 'home' ? homeClubId : awayClubId, player: s.player, minute: s.minute, type: s.type })),
        result_source: 'manual',
      };
      try {
        const { data, error } = await client.from('fixtures').update(values).eq('id', fixtureId).select();
        if (error) return fail(error);
        // RLS で守られた更新は、権限がないとエラーにならず 0 行になる
        if (!data || data.length === 0) return { ok: false, errors: { _form: FORM_MESSAGES.forbidden } };
        for (const kind of ['highlight', 'inside']) {
          const res = await saveVideo(fixtureId, kind, edit.videos[kind]);
          if (res.error) return fail(res.error);
        }
        return { ok: true };
      } catch (e) {
        return fail(e);
      }
    },
  };
}
