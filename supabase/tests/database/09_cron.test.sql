-- 定期実行（pg_cron）の設定（設計書 6.2・11.2.1）
-- 試合結果の取り込みを日本時間 7:00・23:30 に呼ぶ。鍵・URL はマイグレーションに書かず、実行のときに Vault から読む
begin;
select plan(5);

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

select * from finish();
rollback;
