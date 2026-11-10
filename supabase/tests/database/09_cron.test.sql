-- 定期実行（pg_cron）の設定（設計書 6.2・11.2.1）
-- 試合結果の取り込みを日本時間 7:00・23:30 に呼ぶ。鍵・URL はマイグレーションに書かず、実行のときに Vault から読む
begin;
select plan(9);

select results_eq(
  $$select jobname::text, schedule::text from cron.job where jobname like 'sync-results-%' order by jobname$$,
  $$values ('sync-results-am', '0 22 * * *'), ('sync-results-pm', '30 14 * * *')$$,
  '試合結果の取り込みは UTC 22:00（日本時間 7:00）と UTC 14:30（日本時間 23:30）');
select ok(
  (select bool_and(command like '%vault.decrypted_secrets%' and command like '%''project_url''%' and command like '%''cron_secret''%')
     from cron.job where jobname like 'sync-results-%'),
  'URL と合言葉は Vault から読む');
select ok(
  (select bool_and(command not like '%sb_secret_%' and command not like '%eyJ%' and command not like '%supabase.co%')
     from cron.job where jobname like 'sync-results-%'),
  '鍵・URL の値を直接書いていない');
select ok(
  (select bool_and(command like '%/functions/v1/sync-results%' and command like '%x-cron-secret%')
     from cron.job where jobname like 'sync-results-%'),
  'sync-results を合言葉のヘッダー付きで呼ぶ');
select ok(
  (select bool_and(command like '%"club_id": "matsumoto"%' or command like '%"club_id":"matsumoto"%')
     from cron.job where jobname like 'sync-results-%'),
  '取り込むクラブを本文で渡す（D17）');

-- 試合動画の登録（設計書 6.3）：1日1回、日本時間 7:00
select results_eq(
  $$select schedule::text from cron.job where jobname = 'sync-videos'$$,
  $$values ('0 22 * * *')$$,
  '試合動画の登録は UTC 22:00（日本時間 7:00）');
select ok(
  (select command like '%vault.decrypted_secrets%' and command like '%''project_url''%' and command like '%''cron_secret''%'
      and command not like '%sb_secret_%' and command not like '%eyJ%' and command not like '%supabase.co%'
     from cron.job where jobname = 'sync-videos'),
  '試合動画も URL と合言葉を Vault から読み、値を直接書いていない');
select ok(
  (select command like '%/functions/v1/sync-videos%' and command like '%x-cron-secret%'
      and (command like '%"club_id":"matsumoto"%' or command like '%"club_id": "matsumoto"%')
     from cron.job where jobname = 'sync-videos'),
  'sync-videos を合言葉のヘッダーとクラブ付きで呼ぶ');

-- 待ち時間（段4 の最後のレビュー）：試合ページを読む回は「一覧＋2秒×件数」かかるので、既定の5秒では足りない
select ok(
  (select count(*) = 3 and bool_and(command like '%timeout_milliseconds := 60000%')
     from cron.job where jobname in ('sync-results-am', 'sync-results-pm', 'sync-videos')),
  '3つの定期実行とも、待ち時間を60秒にしている');

select * from finish();
rollback;
