-- 自動取り込み（Edge Function の sync-results・sync-videos）の書き込みの関数（設計書 6.2・6.3、D15）
-- 手で直した試合・動画（manual）を上書きしない条件を SQL の中に持つ。読んでから書くまでに
-- 管理者が手で直しても上書きしないため。実行できるのは service_role だけ

-- 試合結果：jleague_match_url は空のときだけ埋める（manual でも）。
-- status・home_score・away_score・result_source は manual でない行だけ書き換え、書き換えたら result_updated_at を入れる。
-- そのほかのキー（kickoff など）は無視する。何か書き換えたら true
create function public.sync_apply_result(p_id text, p_patch jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  f public.fixtures%rowtype;
  new_url text;
  new_status text;
  new_home smallint;
  new_away smallint;
  new_source text;
  url_changed boolean := false;
  result_changed boolean := false;
begin
  -- 行を押さえてから比べる（同時に管理者が直しても、どちらかが後になる）
  select * into f from public.fixtures where id = p_id for update;
  if not found then
    return false;
  end if;

  new_url := f.jleague_match_url;
  if f.jleague_match_url is null and p_patch ->> 'jleague_match_url' is not null then
    new_url := p_patch ->> 'jleague_match_url';
    url_changed := true;
  end if;

  new_status := f.status;
  new_home := f.home_score;
  new_away := f.away_score;
  new_source := f.result_source;
  if f.result_source is distinct from 'manual' then
    if p_patch ? 'status' then new_status := p_patch ->> 'status'; end if;
    if p_patch ? 'home_score' then new_home := (p_patch ->> 'home_score')::smallint; end if;
    if p_patch ? 'away_score' then new_away := (p_patch ->> 'away_score')::smallint; end if;
    if p_patch ? 'result_source' then new_source := p_patch ->> 'result_source'; end if;
    result_changed := (new_status, new_home, new_away, new_source)
      is distinct from (f.status, f.home_score, f.away_score, f.result_source);
  end if;

  if not url_changed and not result_changed then
    return false;
  end if;

  update public.fixtures set
    jleague_match_url = new_url,
    status = new_status,
    home_score = new_home,
    away_score = new_away,
    result_source = new_source,
    result_updated_at = case when result_changed then now() else result_updated_at end
  where id = p_id;
  return true;
end;
$$;

-- 得点者：manual でなく、まだ取り込んでも失敗してもいない行だけ。
-- p_scorers が配列なら得点者と scorers_fetched_at を、null（SQL の null か JSON の null）なら scorers_failed_at を入れる
create function public.sync_apply_scorers(p_id text, p_scorers jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  failed boolean := p_scorers is null or p_scorers = 'null'::jsonb;
begin
  if not failed and jsonb_typeof(p_scorers) <> 'array' then
    raise exception 'p_scorers は配列か null にしてください' using errcode = '22023';
  end if;

  update public.fixtures set
    scorers = case when failed then scorers else p_scorers end,
    scorers_fetched_at = case when failed then scorers_fetched_at else now() end,
    scorers_failed_at = case when failed then now() else scorers_failed_at end
  where id = p_id
    and result_source is distinct from 'manual'
    and scorers_fetched_at is null
    and scorers_failed_at is null;
  return found;
end;
$$;

-- 試合動画：source = 'api' で入れる。同じ試合・種類があれば、api の行だけ更新する（manual は書き換えない）
create function public.sync_upsert_video(p_row jsonb)
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
  where v.source <> 'manual';
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke execute on function public.sync_apply_result(text, jsonb) from public, anon, authenticated;
revoke execute on function public.sync_apply_scorers(text, jsonb) from public, anon, authenticated;
revoke execute on function public.sync_upsert_video(jsonb) from public, anon, authenticated;
grant execute on function public.sync_apply_result(text, jsonb) to service_role;
grant execute on function public.sync_apply_scorers(text, jsonb) to service_role;
grant execute on function public.sync_upsert_video(jsonb) to service_role;
