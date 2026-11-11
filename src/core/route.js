// 画面の URL（# 以降）の読み書きとアクセス判定。純粋な関数だけ（設計書 3章）

export const ROUTES = [
  { name: 'search', path: '/search', access: 'public' },
  { name: 'result', path: '/result', access: 'public' },
  { name: 'fixtures', path: '/fixtures', access: 'public' },
  { name: 'calendar', path: '/calendar', access: 'public' },
  { name: 'trips', path: '/trips', access: 'user' },
  { name: 'trip', path: '/trips/:id', access: 'user' },
  { name: 'records', path: '/records', access: 'user' },
  { name: 'record', path: '/records/:fixtureId', access: 'public' },
  { name: 'settings', path: '/settings', access: 'public' },
  { name: 'login', path: '/login', access: 'public' },
  { name: 'welcome', path: '/welcome', access: 'user' },
  { name: 'admin', path: '/admin/:section?', access: 'admin' },
];

const FALLBACK = { name: 'search', params: {}, query: '' };

const toSegments = (path) => path.split('/').slice(1);

// パターンと実際の区切りを突き合わせる。合えば params、合わなければ null
function matchSegments(pattern, actual) {
  const params = {};
  for (let i = 0; i < pattern.length; i++) {
    const p = pattern[i];
    if (p.startsWith(':')) {
      const optional = p.endsWith('?');
      const key = p.slice(1, optional ? -1 : undefined);
      if (actual[i] === undefined || actual[i] === '') {
        if (!optional || actual.length > i + 1) return null;
        params[key] = null;
      } else {
        params[key] = decodeURIComponent(actual[i]);
      }
    } else if (actual[i] !== p) {
      return null;
    }
  }
  return actual.length > pattern.length ? null : params;
}

export function parseRoute(hash) {
  const text = String(hash ?? '').replace(/^#/, '');
  const q = text.indexOf('?');
  const path = q === -1 ? text : text.slice(0, q);
  const query = q === -1 ? '' : text.slice(q + 1);
  if (!path.startsWith('/')) return { ...FALLBACK };
  const actual = toSegments(path);
  try {
    for (const route of ROUTES) {
      const params = matchSegments(toSegments(route.path), actual);
      if (params) return { name: route.name, params, query };
    }
  } catch {
    // こわれたエンコード（decodeURIComponent の失敗）は search にする
  }
  return { ...FALLBACK };
}

export function buildHash(name, params = {}, query = '') {
  const route = ROUTES.find((r) => r.name === name) ?? ROUTES[0];
  const segs = [];
  for (const p of toSegments(route.path)) {
    if (!p.startsWith(':')) { segs.push(p); continue; }
    const key = p.slice(1).replace(/\?$/, '');
    const v = params?.[key];
    if (v === undefined || v === null || v === '') continue;
    segs.push(encodeURIComponent(v));
  }
  return `#/${segs.join('/')}${query ? `?${query}` : ''}`;
}

// 'ok' | 'login'（ログインが要る）| 'forbidden'（権限がない）
export function routeAccess(name, user) {
  const access = ROUTES.find((r) => r.name === name)?.access ?? 'public';
  if (access === 'public') return 'ok';
  if (!user) return 'login';
  if (access === 'admin' && !user.isAdmin) return 'forbidden';
  return 'ok';
}
