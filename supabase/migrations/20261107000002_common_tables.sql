-- 管理者の判定、updated_at の更新、共通データの表（設計書 4.1・4.3、D7・D12）
-- 共通データ：読みは全員（anon・authenticated）、書きは管理者（is_admin()）と Edge Function（service_role）だけ

-- 管理者の判定：アカウントの app_metadata.role が 'admin'（app_metadata は本人が書き換えられない）
create function public.is_admin() returns boolean
  language sql stable security invoker set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
$$;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- updated_at を更新するトリガーの関数（直接は呼ばせない）
create function public.set_updated_at() returns trigger
  language plpgsql security invoker set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- スタジアム
create table public.stadiums (
  id            text primary key,          -- 例: 'gifu-memorial'
  name          text not null,
  prefecture    text not null,             -- 高速バス検索で使う
  address       text not null,
  lat           double precision not null,
  lng           double precision not null,
  stations      jsonb not null default '[]',  -- 駅の一覧（1つ目が最寄り駅。設計書 4.1）
  airports      jsonb not null default '[]',  -- 最寄り空港とアクセス
  access_url    text,                      -- 公式のアクセスページ
  shuttle_note  text,
  parking_note  text,
  agoda_area    jsonb,                     -- Agodaの地域（6章）。未登録ならAgodaのトップ
  verified_at   date,                      -- 最終確認日
  updated_at    timestamptz not null default now()
);

-- クラブ
create table public.clubs (
  id               text primary key,       -- 例: 'matsumoto'
  name             text not null,
  short_name       text not null,          -- 日程取り込みの照合にも使う
  aliases          text[] not null default '{}',  -- 表記ゆれ（英語のクラブ名も）
  official_url     text,
  jleague_url      text,                   -- Jリーグ公式のクラブページ
  home_stadium_id  text references public.stadiums(id),
  theme_colors     jsonb,                  -- チームカラー（FR-92）
  video_sources    jsonb not null default '[]',  -- 試合動画の取得元（6.3）
  updated_at       timestamptz not null default now()
);

-- シーズン
create table public.seasons (
  id          text primary key,            -- '2026-27'
  starts_on   date not null,
  ends_on     date not null,
  is_current  boolean not null default false
);
create unique index one_current_season on public.seasons (is_current) where is_current;

-- シーズンごとの所属
create table public.season_clubs (
  season_id    text references public.seasons(id) on delete cascade,
  competition  text not null,              -- 'J3'
  club_id      text references public.clubs(id),
  primary key (season_id, competition, club_id)
);

-- 日程（ホーム戦・アウェイ戦とも）
create table public.fixtures (
  id                  text primary key,    -- 試合ID（設計書 4.4）
  season_id           text not null references public.seasons(id),
  competition         text not null,
  round               text,                -- 節。節のない試合は null
  match_date          date not null,
  kickoff             time,                -- 未定なら null（FR-08）
  home_club_id        text references public.clubs(id),
  away_club_id        text references public.clubs(id),
  venue_stadium_id    text references public.stadiums(id),
  venue_name_override text,
  jleague_match_url   text,
  status              text not null default 'scheduled'
                      check (status in ('scheduled','finished','postponed','cancelled')),
  home_score          smallint,
  away_score          smallint,
  scorers             jsonb not null default '[]',
  result_source       text check (result_source in ('api','manual')),  -- 'manual' は自動で上書きしない
  scorers_fetched_at  timestamptz,
  scorers_failed_at   timestamptz,
  result_updated_at   timestamptz,
  updated_at          timestamptz not null default now()
);

-- 試合動画（1試合に種類ごと1本）
create table public.fixture_videos (
  fixture_id    text not null references public.fixtures(id) on delete cascade,
  kind          text not null check (kind in ('highlight','inside')),
  url           text not null,
  title         text,
  channel       text,
  published_at  timestamptz,
  source        text not null check (source in ('api','manual')),
  updated_at    timestamptz not null default now(),
  primary key (fixture_id, kind)
);

-- 6つの表に同じ方針を当てる：RLS、ポリシー、grant
do $$
declare
  t text;
begin
  foreach t in array array['stadiums','clubs','seasons','season_clubs','fixtures','fixture_videos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy public_read on public.%I for select to anon, authenticated using (true)', t);
    execute format('create policy admin_insert on public.%I for insert to authenticated with check ((select public.is_admin()))', t);
    execute format('create policy admin_update on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format('create policy admin_delete on public.%I for delete to authenticated using ((select public.is_admin()))', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end;
$$;

-- updated_at のトリガー
create trigger set_updated_at before update on public.stadiums
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.clubs
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.fixtures
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.fixture_videos
  for each row execute function public.set_updated_at();
