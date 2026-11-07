// 初期データ（supabase/seed-data/*.json）から seed.sql の文字列を作る純粋な関数（設計書 2章・11.4、D8）
// 通信もファイルの読み書きもしない。ファイルの読み書きは build-seed.js が行う。

// 表ごとの列と、その書き方（text・number・bool・date・jsonb・text[]）。並びは DB の列の順
const TABLES = [
  ['stadiums', [
    ['id', 'text'], ['name', 'text'], ['prefecture', 'text'], ['address', 'text'],
    ['lat', 'number'], ['lng', 'number'], ['stations', 'jsonb'], ['airports', 'jsonb'],
    ['access_url', 'text'], ['shuttle_note', 'text'], ['parking_note', 'text'],
    ['agoda_area', 'jsonb'], ['verified_at', 'date'],
  ]],
  ['clubs', [
    ['id', 'text'], ['name', 'text'], ['short_name', 'text'], ['aliases', 'text[]'],
    ['official_url', 'text'], ['jleague_url', 'text'], ['home_stadium_id', 'text'],
    ['theme_colors', 'jsonb'], ['video_sources', 'jsonb'],
  ]],
  ['seasons', [
    ['id', 'text'], ['starts_on', 'date'], ['ends_on', 'date'], ['is_current', 'bool'],
  ]],
  ['season_clubs', [
    ['season_id', 'text'], ['competition', 'text'], ['club_id', 'text'],
  ]],
];

// 値を SQL の値の書き方にする（文字列・数・真偽値・null だけ）
export function sqlLiteral(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return `'${v.replaceAll("'", "''")}'`;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`SQL にできない数です: ${v}`);
    return String(v);
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  throw new Error(`SQL の値にできない型です: ${Array.isArray(v) ? 'array' : typeof v}`);
}

export function sqlJsonb(v) {
  if (v === null || v === undefined) return 'null';
  return `${sqlLiteral(JSON.stringify(v))}::jsonb`;
}

export function sqlTextArray(arr) {
  if (!arr || arr.length === 0) return `'{}'::text[]`;
  return `array[${arr.map(sqlLiteral).join(',')}]::text[]`;
}

function formatValue(v, kind) {
  if (kind === 'jsonb') return sqlJsonb(v);
  if (kind === 'text[]') return sqlTextArray(v);
  return sqlLiteral(v);
}

// data：{ stadiums, clubs, seasons, season_clubs }。各行の項目名は DB の列名と同じ
export function buildSeedSql(data) {
  const lines = [
    '-- このファイルは npm run seed で supabase/seed-data/ の JSON から作る。手で直さない（設計書 11.4）',
    '-- どの insert も on conflict do nothing なので、もう一度流しても管理者が直した値は上書きしない',
  ];
  for (const [table, columns] of TABLES) {
    const names = columns.map(([c]) => c);
    lines.push('', `-- ${table}`);
    for (const row of data[table] ?? []) {
      const unknown = Object.keys(row).filter((k) => !names.includes(k));
      if (unknown.length > 0) throw new Error(`${table} に知らない項目があります: ${unknown.join(', ')}`);
      const values = columns.map(([c, kind]) => formatValue(row[c], kind));
      lines.push(`insert into public.${table} (${names.join(', ')}) values (${values.join(', ')}) on conflict do nothing;`);
    }
  }
  return lines.join('\n') + '\n';
}
