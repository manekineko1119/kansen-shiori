-- 定期実行が Edge Function を呼ぶときの待ち時間を60秒にする（設計書 6.2、段4 の最後のレビュー）
-- pg_net の既定（5秒）だと、試合ページを読む回（一覧＋2秒×最大5件）を待ちきれない。
-- cron.schedule は同じ名前で呼ぶと上書きされる。時刻・本文・Vault の読み方は 20261110000010・11 と同じ

select cron.schedule('sync-results-am', '0 22 * * *', $cmd$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-results',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"club_id":"matsumoto"}'::jsonb,
    timeout_milliseconds := 60000
  );
$cmd$);

select cron.schedule('sync-results-pm', '30 14 * * *', $cmd$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-results',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"club_id":"matsumoto"}'::jsonb,
    timeout_milliseconds := 60000
  );
$cmd$);

select cron.schedule('sync-videos', '0 22 * * *', $cmd$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-videos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"club_id":"matsumoto"}'::jsonb,
    timeout_milliseconds := 60000
  );
$cmd$);
