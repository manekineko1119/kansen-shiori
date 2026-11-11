-- 止まった取り込みの中断・実行を1つずつ・上限と実行中で読まなかった回の印（設計書 3.4・6.2、段4 の最後のレビューの1・2・4、D37）
-- 1. 実行が途中で止まると running = true が残り、管理画面のボタンが押せないままになる。
--    ran_at から10分を過ぎた running の行は、予約のときに「中断」にする（回数は予約のまま数える＝多めに数える側）
-- 2. 同時に走ると「ページの間を2秒以上あける」が守られない。10分以内の running の行があれば予約しない（0行）
-- 4. 上限・実行中で一覧を読まなかった回は、失敗と区別できるよう skipped_reason に理由を残す（行は Edge Function が入れる）
-- 5. 同じ動画を毎日「登録しました」にしないよう、sync_upsert_video は値が変わったときだけ書き換える

alter table public.sync_runs
  add column skipped_reason text check (skipped_reason in ('limit', 'running'));  -- null は一覧を読もうとした回

-- 予約（20261110000009 の作りに、1・2 を足す）
create or replace function public.sync_reserve_run(
  p_job text,
  p_day_start timestamptz,
  p_list_limit integer,
  p_pages_limit integer,
  p_pages_per_run integer
)
returns table (run_id bigint, pages_allowed integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  used_list integer;
  used_pages integer;
  allowed integer;
  new_id bigint;
begin
  -- 同じジョブの予約を1つずつにする（トランザクションの終わりで外れる）
  perform pg_advisory_xact_lock(hashtext('sync_runs:' || p_job));

  -- 1. 10分を過ぎた実行中の行は中断にする。list_read・pages_read は予約のまま残す（1日の上限に数える）
  update public.sync_runs set
    running = false,
    ok = false,
    message = '中断しました（10分以内に終わりませんでした）'
  where job = p_job and running and ran_at < now() - interval '10 minutes';

  -- 2. 10分以内の実行中の行があれば予約しない
  if exists (select 1 from public.sync_runs r where r.job = p_job and r.running) then
    return;
  end if;

  select coalesce(sum(r.list_read), 0), coalesce(sum(r.pages_read), 0)
    into used_list, used_pages
    from public.sync_runs r
    where r.job = p_job and r.ran_at >= p_day_start;

  if used_list >= p_list_limit then
    return;
  end if;

  allowed := greatest(0, least(p_pages_per_run, p_pages_limit - used_pages));
  insert into public.sync_runs (job, ok, message, running, list_read, pages_read)
    values (p_job, false, '実行中', true, 1, allowed)
    returning id into new_id;

  run_id := new_id;
  pages_allowed := allowed;
  return next;
end;
$$;

-- 予約が0行だったときの理由：10分以内の実行中の行があれば 'running'、なければ 'limit'。
-- sync_reserve_run のすぐあとに呼ぶ（止まった行はそこで中断になっている）
create function public.sync_skip_reason(p_job text)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.sync_runs r
      where r.job = p_job and r.running and r.ran_at >= now() - interval '10 minutes'
    ) then 'running'
    else 'limit'
  end;
$$;

revoke execute on function public.sync_skip_reason(text) from public, anon, authenticated;
grant execute on function public.sync_skip_reason(text) to service_role;

-- 動画の登録（20261110000008 の作りに、5 を足す）。
-- 戻り値：true＝入れた・書き換えた、false＝手入力（manual）なので書き換えなかった、null＝同じ値なので書き換えなかった
create or replace function public.sync_upsert_video(p_row jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n integer;
begin
  insert into public.fixture_videos as v (fixture_id, kind, url, title, channel, published_at, source)
  values (
    p_row ->> 'fixture_id',
    p_row ->> 'kind',
    p_row ->> 'url',
    p_row ->> 'title',
    p_row ->> 'channel',
    (p_row ->> 'published_at')::timestamptz,
    'api'
  )
  on conflict (fixture_id, kind) do update set
    url = excluded.url,
    title = excluded.title,
    channel = excluded.channel,
    published_at = excluded.published_at
  where v.source <> 'manual'
    and (v.url, v.title, v.channel, v.published_at)
      is distinct from (excluded.url, excluded.title, excluded.channel, excluded.published_at);
  get diagnostics n = row_count;
  if n > 0 then
    return true;
  end if;
  if exists (
    select 1 from public.fixture_videos v
    where v.fixture_id = p_row ->> 'fixture_id' and v.kind = p_row ->> 'kind' and v.source = 'manual'
  ) then
    return false;
  end if;
  return null;
end;
$$;
