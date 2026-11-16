// 遠征予定の保存・削除（設計書 4.2・9章）。user_id は送らない（DB の既定値 auth.uid()）。失敗の理由は toFormError（D34）
import { validateTrip } from '../core/validate.js';
import { toFormError } from './errors.js';

const blankToNull = (v) => {
  const t = typeof v === 'string' ? v.trim() : '';
  return t === '' ? null : t;
};

// 画面の値 → 送る値。試合を選んでいれば custom_* は送らない（null）
function toRow(trip) {
  const hasFixture = blankToNull(trip.fixture_id) !== null;
  return {
    fixture_id: hasFixture ? trip.fixture_id : null,
    custom_venue: hasFixture ? null : blankToNull(trip.custom_venue),
    custom_date: hasFixture ? null : blankToNull(trip.custom_date),
    title: String(trip.title ?? '').trim(),
    modes: trip.modes ?? [],
    lodging: trip.lodging ?? 'none',
    transport_memo: blankToNull(trip.transport_memo),
    lodging_memo: blankToNull(trip.lodging_memo),
    memo: blankToNull(trip.memo),
  };
}

const fail = (e, action) => {
  const r = toFormError(e, action);
  return r === 'expired' ? 'expired' : { ok: false, errors: r };
};

export function createTripStore({ client }) {
  return {
    async save(trip) {
      const v = validateTrip(trip);
      if (!v.ok) return { ok: false, errors: v.errors };
      const row = toRow(trip);
      try {
        const q = trip.id
          ? client.from('trips').update(row).eq('id', trip.id)
          : client.from('trips').insert(row);
        const { data, error } = await q.select().single();
        if (error) return fail(error);
        return { ok: true, id: data?.id ?? trip.id };
      } catch (e) {
        return fail(e);
      }
    },
    async remove(id) {
      try {
        const { error } = await client.from('trips').delete().eq('id', id);
        if (error) return fail(error, 'delete');
        return { ok: true };
      } catch (e) {
        return fail(e, 'delete');
      }
    },
  };
}
