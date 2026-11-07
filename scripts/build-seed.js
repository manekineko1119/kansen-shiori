// supabase/seed-data/2026-27.json から supabase/seed.sql を作る（npm run seed。設計書 11.4、D8）
// 開発用の道具。アプリには含めない
import { readFileSync, writeFileSync } from 'node:fs';
import { buildSeedSql } from './seed-sql.js';

const src = new URL('../supabase/seed-data/2026-27.json', import.meta.url);
const dest = new URL('../supabase/seed.sql', import.meta.url);

const data = JSON.parse(readFileSync(src, 'utf8'));
writeFileSync(dest, buildSeedSql(data), 'utf8');
console.log('supabase/seed.sql を作りました');
