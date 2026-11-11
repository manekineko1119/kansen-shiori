// 画面に渡す ctx を作る（設計書 3.5、D29）。ctx の形は段6 の全画面で共通
import { routeKey } from './view-state.js';
import { jstNow } from '../core/time.js';

const byId = (rows) => Object.fromEntries((rows ?? []).map((r) => [r.id, r]));

// 共通データの状態に、引きやすい形を足す。まだなければ status: 'loading'
export function makeMasters(masters) {
  const data = masters?.data ?? null;
  return {
    status: 'loading', ...masters, data,
    clubsById: byId(data?.clubs), stadiumsById: byId(data?.stadiums), fixturesById: byId(data?.fixtures),
  };
}

// 描くたびに作る。nowMs はここで渡す（src/core では Date.now() を使わない）
export function buildCtx({ route, state, user, masters, settings, personal = null, data, nowMs, navigate, redraw, onExpired, auth, welcome }) {
  return {
    route, key: routeKey(route), state, user,
    masters: makeMasters(masters), settings, personal, nowMs, today: jstNow(nowMs).date,
    data, navigate, redraw, onExpired, auth, welcome,
  };
}
