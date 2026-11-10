-- 試合動画の登録（Edge Function sync-videos）を1日1回呼ぶ（設計書 6.3・11.2.1）
-- 日本時間 7:00 ＝ UTC 22:00（前日）。URL と合言葉は 20261110000010 と同じく Vault から読む

select cron.schedule('sync-videos', '0 22 * * *', $cmd$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-videos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"club_id":"matsumoto"}'::jsonb
  );
$cmd$);
