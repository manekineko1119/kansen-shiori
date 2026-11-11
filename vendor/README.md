# vendor

アプリが使う外部のライブラリを、版を固定してここに置く（CDN から直接読まない。障害とオフラインへの対策）。

## supabase-js.mjs

| 項目 | 内容 |
|---|---|
| ライブラリ | `@supabase/supabase-js` 2.118.0（auth-js・postgrest-js・realtime-js・storage-js・functions-js を含む 1ファイルの ES モジュール） |
| 取得元 | `https://esm.sh/@supabase/supabase-js@2.118.0/es2022/supabase-js.bundle.mjs`（`https://esm.sh/@supabase/supabase-js@2.118.0?bundle&target=es2022` が指す先） |
| 取得日 | 2026-11-11 |
| 取得したままの SHA-256 | `9a8556e320665d4dad6aaeeb0a0824f7342d6eb91785e6e61f3c1d2f12f058ce`（227682 バイト） |
| 差し替えたあとの SHA-256 | `5a0f5b83743b31c4ab80bc652f9662efde5527b0dcd9af0df1127a364bee3d8d`（227658 バイト。`tests/vendor.test.js` で確かめる） |
| ライセンス | MIT（Copyright (c) 2020 Supabase）。全文は `LICENSE-supabase-js.txt`（同じ版のパッケージの `LICENSE`） |

### 差し替えた2行

esm.sh の 1ファイル版は、先頭で esm.sh の Node 用の部品を読む。このままだと外のファイルを読むので、`node scripts/patch-vendor.js` で次の2行を差し替えた。

| 元 | 差し替え後 |
|---|---|
| `import __Process$ from "/node/process.mjs";` | `const __Process$ = globalThis.process;` |
| `import { Buffer as __Buffer$ } from "/node/buffer.mjs";` | `const __Buffer$ = globalThis.Buffer;` |

ブラウザには `process`・`Buffer` がないので、どちらも `undefined` になる。supabase-js の中での使い方は「Node で動いているかを調べる」（3か所）と「`Buffer` がなければ `btoa` を使う」（1か所）だけで、ブラウザ用の動きになる。

### 版を上げるとき

1. 新しい版を上の取得元の形で取り直し、`vendor/supabase-js.mjs` を置き換える
2. `node scripts/patch-vendor.js` を実行する
3. この表（版・取得日・2つの SHA-256）と `LICENSE-supabase-js.txt` を更新し、設計書 1.2 の表と変更履歴も直す
4. `npm test` が通り、ブラウザで Supabase から読めることを確かめる
