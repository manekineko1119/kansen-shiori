// テスト用の Supabase クライアントの偽物（5-5・5-7・段6 で使う）
// tables: { 表の名前: 行の配列 }
// opts.failOn: { 表・関数・バケットの名前: { message, code? } } → { data: null, error } を返す
// opts.failNth: { 表の名前: { n, message, code? } } → その表への n 回目（1 から数える）の呼び出しだけ失敗させる
// opts.throwOn: 表・関数・バケットの名前の配列 → TypeError('Failed to fetch') を投げる
// opts.rpcs / opts.functions: { 名前: (args または opts) => data }（なければ data は null）
// 呼び出しはすべて calls に残る。from()：{ table, op, ... }、rpc：{ op: 'rpc', name, args }、
// functions.invoke：{ op: 'invoke', name, opts }、storage：{ op: 'upload' | 'remove' | 'signedUrl', bucket, ... }
export function fakeClient(tables, { failOn = {}, failNth = {}, throwOn = [], rpcs = {}, functions = {} } = {}) {
  const calls = [];
  const objects = {}; // { バケット: { パス: file } }
  const counts = {}; // 表ごとの呼び出しの回数（failNth 用）
  let nextId = 0; // insert で id がない行に付ける 'id-1'、'id-2'…

  // 表以外の呼び出しの共通の結果
  const outcome = (name, make) => {
    if (throwOn.includes(name)) throw new TypeError('Failed to fetch');
    if (failOn[name]) return { data: null, error: failOn[name] };
    return { data: make(), error: null };
  };
  // await したときに fn を実行する（投げた例外は拒否された Promise になる）
  const later = (fn) => ({
    then(resolve, reject) {
      try {
        return Promise.resolve(fn()).then(resolve, reject);
      } catch (e) {
        return Promise.reject(e).then(resolve, reject);
      }
    },
  });

  const client = {
    calls,
    from(table) {
      const call = { table, op: 'select', eq: [], in: [], gte: [], order: null, limit: null, rows: null };
      calls.push(call);
      let single = false;
      const run = () => {
        if (throwOn.includes(table)) throw new TypeError('Failed to fetch');
        if (failOn[table]) return { data: null, error: failOn[table] };
        counts[table] = (counts[table] ?? 0) + 1;
        if (failNth[table]?.n === counts[table]) return { data: null, error: { message: failNth[table].message, code: failNth[table].code } };
        if (call.op === 'upsert' || call.op === 'insert') {
          const rows = tables[table] ?? (tables[table] = []);
          if (call.op === 'insert') call.rows = call.rows.map((r) => (r.id == null ? { ...r, id: `id-${++nextId}` } : r));
          for (const r of call.rows) rows.push(r);
          return { data: single ? (call.rows[0] ?? null) : call.rows, error: null };
        }
        const matches = (r) => call.eq.every(([col, val]) => r[col] === val) && call.in.every(([col, vals]) => vals.includes(r[col]))
          && call.gte.every(([col, val]) => r[col] >= val);
        if (call.op === 'update') {
          const hit = (tables[table] ?? []).filter(matches);
          for (const r of hit) Object.assign(r, call.values);
          return { data: single ? (hit[0] ?? null) : hit, error: null };
        }
        if (call.op === 'delete') {
          const all = tables[table] ?? [];
          const hit = all.filter(matches);
          tables[table] = all.filter((r) => !hit.includes(r));
          return { data: hit, error: null };
        }
        let rows = (tables[table] ?? []).filter(matches);
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
        gte(col, val) { call.gte.push([col, val]); return q; }, // 文字列の比較（ISO の日時は同じ形なら並びが合う）
        order(col, opt = {}) { call.order = { col, ascending: opt.ascending !== false }; return q; },
        limit(n) { call.limit = n; return q; },
        maybeSingle() { single = true; return q; },
        single() { single = true; return q; },
        insert(rows) { call.op = 'insert'; call.values = rows; call.rows = Array.isArray(rows) ? rows : [rows]; return q; },
        update(values) { call.op = 'update'; call.values = values; return q; },
        delete() { call.op = 'delete'; return q; },
        upsert(rows, opts = {}) { call.op = 'upsert'; call.values = rows; call.onConflict = opts.onConflict; call.rows = Array.isArray(rows) ? rows : [rows]; return q; },
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
    rpc(name, args) {
      calls.push({ op: 'rpc', name, args });
      return later(() => outcome(name, () => (rpcs[name] ? rpcs[name](args) : null)));
    },
    functions: {
      invoke(name, opts) {
        calls.push({ op: 'invoke', name, opts });
        return later(() => outcome(name, () => (functions[name] ? functions[name](opts) : null)));
      },
    },
    storage: {
      objects,
      from(bucket) {
        const files = objects[bucket] ?? (objects[bucket] = {});
        return {
          upload(path, file, opts) {
            calls.push({ op: 'upload', bucket, path, file, opts });
            return later(() => outcome(bucket, () => { files[path] = file; return { path }; }));
          },
          remove(paths) {
            calls.push({ op: 'remove', bucket, paths });
            return later(() => outcome(bucket, () => { for (const p of paths) delete files[p]; return paths.map((name) => ({ name })); }));
          },
          createSignedUrl(path, seconds) {
            calls.push({ op: 'signedUrl', bucket, path, seconds });
            return later(() => outcome(bucket, () => ({ signedUrl: `https://example.test/${bucket}/${path}?t=1` })));
          },
        };
      },
    },
  };
  return client;
}
