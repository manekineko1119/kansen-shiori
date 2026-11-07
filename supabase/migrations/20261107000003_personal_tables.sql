-- 個人データの表（設計書 4.2・4.3、D11・D12）
-- 本人（user_id = auth.uid()）だけが読み書きできる。anon・service_role には権限を与えない

-- 設定（ログイン時）
create table public.user_settings (
  user_id            uuid primary key references auth.users on delete cascade default auth.uid(),
  support_club_id    text not null default 'matsumoto' references public.clubs(id),
  origin_station     text not null default '松本',
  origin_prefecture  text not null default '長野県',
  origin_airports    jsonb not null default '[
    {"code":"MMJ","name":"信州まつもと空港","station":null,"access_min":30,"note":"松本駅からバス・タクシー"},
    {"code":"NGO","name":"中部国際空港","station":"中部国際空港","access_min":180,"note":"特急しなの＋名鉄"},
    {"code":"HND","name":"羽田空港","station":"羽田空港第1・第2ターミナル(京急)","access_min":210,"note":"特急あずさ＋京急"}]',
  airport_checkin_min  integer not null default 60 check (airport_checkin_min between 0 and 240),
  airport_arrival_min  integer not null default 20 check (airport_arrival_min between 0 and 120),
  arrive_before_min  integer not null default 90 check (arrive_before_min between 0 and 600),
  default_modes      text[] not null default '{train}',
  updated_at         timestamptz not null default now()
);

-- 遠征予定（常に非公開。公開の項目は持たない：FR-25）
create table public.trips (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade default auth.uid(),
  fixture_id      text references public.fixtures(id),
  custom_venue    text,
  custom_date     date,
  title           text not null,
  modes           text[] not null default '{}',
  lodging         text not null default 'none'
                  check (lodging in ('none','pre','post','both')),
  transport_memo  text,
  lodging_memo    text,
  memo            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (fixture_id is not null or (custom_venue is not null and custom_date is not null))
);

-- 観戦記録（自分の記録。試合の情報は fixtures に持つ）
create table public.match_records (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade default auth.uid(),
  fixture_id    text not null references public.fixtures(id),
  trip_id       uuid references public.trips(id) on delete set null,
  watch_style   text not null default 'stadium'
                check (watch_style in ('stadium','broadcast','public_viewing')),
  photo_path    text,
  cost_transport integer check (cost_transport >= 0),
  cost_lodging   integer check (cost_lodging >= 0),
  cost_ticket    integer check (cost_ticket >= 0),
  cost_goods     integer check (cost_goods >= 0),
  cost_food      integer check (cost_food >= 0),
  memo          text,
  visibility    text not null default 'private' check (visibility in ('private','public')),  -- フェーズ1では他人に見せない
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, fixture_id)
);

-- 3つの表に同じ方針：本人だけ
do $$
declare
  t text;
begin
  foreach t in array array['user_settings','trips','match_records'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy own_select on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy own_delete on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

create policy own_insert on public.user_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy own_update on public.user_settings for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy own_insert on public.trips for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy own_update on public.trips for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- 観戦記録は、本人の遠征予定にだけひも付けられる（D11）
create policy own_insert on public.match_records for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (trip_id is null or exists (
      select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid())))
  );
create policy own_update on public.match_records for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (trip_id is null or exists (
      select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid())))
  );
