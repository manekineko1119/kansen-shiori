-- PK 戦の列と、試合ページの URL での登録（match）の回数の予約（設計書 4.1・6.2）
-- 1. fixtures に PK 戦の得点（どちらも null か、どちらも 0 以上で同点でない）
-- 2. sync_runs.job に 'match'（管理者が試合ページの URL で1試合ずつ登録する実行）
-- 3. 試合ページの1日の上限は results と match の合計。同じロックで数える
-- 4. match 用の予約 sync_reserve_match_page

alter table public.fixtures
  add column home_pk smallint,
  add column away_pk smallint,
  add constraint fixtures_pk_check check (
    (home_pk is null and away_pk is null)
    or (home_pk is not null and away_pk is not null and home_pk >= 0 and away_pk >= 0 and home_pk <> away_pk)
  );

alter table public.sync_runs drop constraint sync_runs_job_check;
alter table public.sync_runs add constraint sync_runs_job_check check (job in ('results', 'videos', 'match'));

-- 予約（20261112000013 の作りに、ページ数の共通ロックと results・match の合計を足す）
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
  -- 試合ページの回数は results と match で共通なので、数える間は両方を止める
  perform pg_advisory_xact_lock(hashtext('sync_runs:pages'));

  -- 10分を過ぎた実行中の行は中断にする。list_read・pages_read は予約のまま残す（1日の上限に数える）
  update public.sync_runs set
    running = false,
    ok = false,
    message = '中断しました（10分以内に終わりませんでした）'
  where job = p_job and running and ran_at < now() - interval '10 minutes';

  -- 10分以内の実行中の行があれば予約しない
  if exists (select 1 from public.sync_runs r where r.job = p_job and r.running) then
    return;
  end if;

  select coalesce(sum(r.list_read) filter (where r.job = p_job), 0),
         coalesce(sum(r.pages_read) filter (where r.job in ('results', 'match')), 0)
    into used_list, used_pages
    from public.sync_runs r
    where r.ran_at >= p_day_start;

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

-- URL での登録：試合ページ1件ぶんを予約する。上限（今日の results・match の合計）なら null
create function public.sync_reserve_match_page(
  p_day_start timestamptz,
  p_pages_limit integer
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  used_pages integer;
  new_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('sync_runs:pages'));

  update public.sync_runs set
    running = false,
    ok = false,
    message = '中断しました（10分以内に終わりませんでした）'
  where job = 'match' and running and ran_at < now() - interval '10 minutes';

  select coalesce(sum(r.pages_read), 0)
    into used_pages
    from public.sync_runs r
    where r.job in ('results', 'match') and r.ran_at >= p_day_start;

  if used_pages >= p_pages_limit then
    return null;
  end if;

  insert into public.sync_runs (job, ok, message, running, list_read, pages_read)
    values ('match', false, '実行中', true, 0, 1)
    returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.sync_reserve_match_page(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.sync_reserve_match_page(timestamptz, integer) to service_role;
