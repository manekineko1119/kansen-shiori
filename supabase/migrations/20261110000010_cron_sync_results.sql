-- 試合結果の取り込み（Edge Function sync-results）を1日2回呼ぶ（設計書 6.2・11.2.1）
-- pg_cron は UTC で動く：日本時間 7:00 ＝ UTC 22:00（前日）、23:30 ＝ UTC 14:30
-- URL と合言葉はここに書かず、実行のときに Vault（project_url・cron_secret）から読む。
-- ローカルの Vault には入れない（ローカルの定期実行が本物のサイトを読まないため。空なら URL が null になり呼び出しは失敗する）

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule('sync-results-am', '0 22 * * *', $cmd$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-results',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"club_id":"matsumoto"}'::jsonb
  );
$cmd$);

select cron.schedule('sync-results-pm', '30 14 * * *', $cmd$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-results',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"club_id":"matsumoto"}'::jsonb
  );
$cmd$);
