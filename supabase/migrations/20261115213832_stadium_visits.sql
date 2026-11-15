-- 手で足した「行った会場」（地図の spec 3.1、FR-71）。観戦記録から求める分はここに入れない
-- 本人（user_id = auth.uid()）だけが読み書きできる。anon には権限を与えない。編集はしない（消して足し直す）
create table public.stadium_visits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  stadium_id  text not null references public.stadiums(id),
  season_id   text references public.seasons(id),   -- 任意。null は「シーズンなし」（通算にだけ数える）
  created_at  timestamptz not null default now()
);

create index stadium_visits_user_id_idx on public.stadium_visits (user_id);
create index stadium_visits_stadium_id_idx on public.stadium_visits (stadium_id);

alter table public.stadium_visits enable row level security;

create policy own_select on public.stadium_visits for select to authenticated
  using ((select auth.uid()) = user_id);
create policy own_insert on public.stadium_visits for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy own_delete on public.stadium_visits for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, delete on public.stadium_visits to authenticated, service_role;
