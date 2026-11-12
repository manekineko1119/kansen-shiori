// 手で足した「行った会場」の追加・削除（地図の spec 3.1・5章）。user_id は送らない（DB の既定値 auth.uid()）。失敗の理由は toFormError（D34）
import { toFormError } from './errors.js';

const fail = (e) => {
  const r = toFormError(e);
  return r === 'expired' ? 'expired' : { ok: false, errors: r };
};

export function createVisitStore({ client }) {
  return {
    async add({ stadium_id, season_id } = {}) {
      const stadium = typeof stadium_id === 'string' ? stadium_id.trim() : '';
      if (stadium === '') return { ok: false, errors: { stadium_id: '会場を選んでください' } };
      const row = { stadium_id: stadium, season_id: season_id ? season_id : null };
      try {
        const { data, error } = await client.from('stadium_visits').insert(row).select().single();
        if (error) return fail(error);
        return { ok: true, id: data?.id };
      } catch (e) {
        return fail(e);
      }
    },
    async remove(id) {
      try {
        const { error } = await client.from('stadium_visits').delete().eq('id', id);
        if (error) return fail(error);
        return { ok: true };
      } catch (e) {
        return fail(e);
      }
    },
  };
}
