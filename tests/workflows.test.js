import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

// GitHub Actions のワークフロー（設計書 11.2・11.3）。公開リポジトリなので、権限・鍵・成果物の中身を文字列で確かめる
const dir = new URL('../.github/workflows/', import.meta.url);
const read = (name) => readFileSync(new URL(name, dir), 'utf8');

function common(name) {
  assert.ok(existsSync(new URL(name, dir)), `${name} がない`);
  const y = read(name);
  assert.match(y, /^permissions: \{\}$/m, `${name}：権限は何も与えない`);
  assert.match(y, /^\s+workflow_dispatch:/m, `${name}：手動で実行できる`);
  assert.match(y, /^\s+- cron: '[^']+'/m, `${name}：定期実行がある`);
  assert.match(y, /timeout-minutes: \d+/, `${name}：時間の上限がある`);
  // 鍵の値を直に書かない（Secrets から読む）
  assert.doesNotMatch(y, /sb_(publishable|secret)_|eyJ[\w-]{10,}|postgres(ql)?:\/\//, `${name}：鍵・接続文字列が直に書かれている`);
  // set -x や secrets の echo をしない
  assert.doesNotMatch(y, /set -x|echo .*\$\{\{\s*secrets\./, `${name}：秘密の値を表示しうる`);
  // アクションはコミットの SHA に固定する
  for (const m of y.matchAll(/uses:\s*(\S+)/g)) assert.match(m[1], /@[0-9a-f]{40}$/, `${name}：${m[1]} が SHA に固定されていない`);
  return y;
}

test('keepalive：clubs を1件読む。鍵は apikey ヘッダーだけに付ける（11.1・11.2）', () => {
  const y = common('keepalive.yml');
  assert.match(y, /rest\/v1\/clubs\?select=id&limit=1/);
  assert.match(y, /-H "apikey: \$KEY"/);
  assert.doesNotMatch(y, /Authorization/i);
  assert.match(y, /KEY: \$\{\{ secrets\.SUPABASE_PUBLISHABLE_KEY \}\}/);
  assert.match(y, /URL: \$\{\{ secrets\.SUPABASE_URL \}\}/);
  assert.doesNotMatch(y, /uses:/, 'アクションは使わない');
});

test('backup：暗号化した .gpg だけを成果物に入れる（11.3）', () => {
  const y = common('backup.yml');
  assert.match(y, /cli="npx --yes supabase@2\.122\.0"/); // 設計書 1.2 の版
  assert.equal([...y.matchAll(/\$cli db dump --db-url "\$DB_URL"/g)].length, 3, 'roles・schema・data の3つ');
  assert.match(y, /DB_URL: \$\{\{ secrets\.SUPABASE_DB_URL \}\}/);
  assert.match(y, /secrets\.BACKUP_PASSPHRASE/);
  assert.match(y, /gpg --batch .*--symmetric --cipher-algo AES256/);
  const upload = y.indexOf('actions/upload-artifact@');
  assert.ok(upload > 0, 'upload-artifact がない');
  assert.ok(y.indexOf('--symmetric') < upload, '暗号化が upload より前');
  const path = y.slice(upload).match(/path: (\S+)/)?.[1];
  assert.match(path ?? '', /\.gpg$/, '成果物は .gpg だけ');
  assert.match(y.slice(upload), /retention-days: 90/);
  assert.match(y.slice(upload), /if-no-files-found: error/);
});
