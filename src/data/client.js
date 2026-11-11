// Supabase のクライアント。アプリ全体で1つだけ作って使い回す（設計書 2章・7章）。
// ログインは PKCE（D24）：戻ってきた URL の ?code= を supabase-js が読み、セッションに換える。

import { createClient } from '../../vendor/supabase-js.mjs';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../config.js';

let client = null;

export function getClient() {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}
