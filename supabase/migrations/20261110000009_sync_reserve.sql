-- 取り込みの回数の予約（設計書 6.2、D21）
-- 記録を実行の最後に書くと、同時に2つの実行が走ったときに両方が「残りあり」と見て読んでしまう。
-- 読む前に回数を予約し、終わったら本当の回数に直す。止まって直せなかった行は予約の回数のまま数える

alter table public.sync_runs add column running boolean not null default false;  -- 予約して実行中
grant update on public.sync_runs to service_role;  -- 予約の行を終わりにするため

-- 今日（p_day_start 以降）の p_job の回数を数え、一覧が1回読めるなら予約の行を入れる。
-- 試合ページは、1回の上限と今日の残りの小さいほうを予約する。読めなければ0行を返す
create function public.sync_reserve_run(
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

-- 予約の行を終わりにする。回数は予約より増やさない。終わった行は直さない
create function public.sync_finish_run(
  p_run_id bigint,
  p_ok boolean,
  p_message text,
  p_list_read integer,
  p_pages_read integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.sync_runs set
    running = false,
    ok = p_ok,
    message = p_message,
    list_read = least(list_read, greatest(0, p_list_read)),
    pages_read = least(pages_read, greatest(0, p_pages_read))
  where id = p_run_id and running;
  return found;
end;
$$;

revoke execute on function public.sync_reserve_run(text, timestamptz, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.sync_finish_run(bigint, boolean, text, integer, integer) from public, anon, authenticated;
grant execute on function public.sync_reserve_run(text, timestamptz, integer, integer, integer) to service_role;
grant execute on function public.sync_finish_run(bigint, boolean, text, integer, integer) to service_role;
