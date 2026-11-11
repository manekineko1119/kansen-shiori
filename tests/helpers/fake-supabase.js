// テスト用の Supabase クライアントの偽物（5-5・5-7 で使う）
// tables: { 表の名前: 行の配列 }
// opts.failOn: { 表の名前: { message, code? } } → { data: null, error } を返す
// opts.throwOn: 表の名前の配列 → TypeError('Failed to fetch') を投げる
export function fakeClient(tables, { failOn = {}, throwOn = [] } = {}) {
  const calls = [];
  const client = {
    calls,
    from(table) {
      const call = { table, op: 'select', eq: [], in: [], order: null, limit: null, rows: null };
      calls.push(call);
      let single = false;
      const run = () => {
        if (throwOn.includes(table)) throw new TypeError('Failed to fetch');
        if (failOn[table]) return { data: null, error: failOn[table] };
        if (call.op === 'upsert') {
          const rows = tables[table] ?? (tables[table] = []);
          for (const r of call.rows) rows.push(r);
          return { data: call.rows, error: null };
        }
        let rows = [...(tables[table] ?? [])];
        for (const [col, val] of call.eq) rows = rows.filter((r) => r[col] === val);
        for (const [col, vals] of call.in) rows = rows.filter((r) => vals.includes(r[col]));
        if (call.order) {
          const { col, ascending } = call.order;
          rows.sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (ascending ? 1 : -1));
        }
        if (call.limit != null) rows = rows.slice(0, call.limit);
        return { data: single ? (rows[0] ?? null) : rows, error: null };
      };
      const q = {
        select(columns) { call.columns = columns; return q; },
        eq(col, val) { call.eq.push([col, val]); return q; },
        in(col, vals) { call.in.push([col, vals]); return q; },
        order(col, opt = {}) { call.order = { col, ascending: opt.ascending !== false }; return q; },
        limit(n) { call.limit = n; return q; },
        maybeSingle() { single = true; return q; },
        upsert(rows) { call.op = 'upsert'; call.rows = Array.isArray(rows) ? rows : [rows]; return q; },
        then(resolve, reject) {
          try {
            return Promise.resolve(run()).then(resolve, reject);
          } catch (e) {
            return Promise.reject(e).then(resolve, reject);
          }
        },
      };
      return q;
    },
  };
  return client;
}
