-- 個人データ（user_settings, trips, match_records）の権限（設計書 4.2・4.3、D11）
-- 本人（user_id = auth.uid()）だけが読み書きできる。visibility = 'public' でもフェーズ1では他人に見せない
begin;
select plan(19);

-- 準備（postgres のまま入れる）
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 't1@example.test'),
  ('22222222-2222-4222-8222-222222222222', 't2@example.test');
insert into public.clubs (id, name, short_name) values ('t-club', 'テストFC', 'テスト'), ('t-opp', '相手FC', '相手');
insert into public.seasons (id, starts_on, ends_on) values ('t-season', '2030-08-01', '2031-05-31');
insert into public.fixtures (id, season_id, competition, round, match_date, home_club_id, away_club_id) values
  ('t-fx2', 't-season', 'J3', '1', '2030-08-10', 't-club', 't-opp'),
  ('t-fx3', 't-season', 'J3', '2', '2030-08-17', 't-opp', 't-club'),
  ('t-fx4', 't-season', 'J3', '3', '2030-08-24', 't-club', 't-opp');
insert into public.user_settings (user_id, support_club_id) values
  ('11111111-1111-4111-8111-111111111111', 't-club'),
  ('22222222-2222-4222-8222-222222222222', 't-club');
insert into public.trips (id, user_id, title, custom_venue, custom_date, updated_at) values
  ('00000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '遠征1', 'テスト競技場', '2030-08-10', '2000-01-01'),
  ('00000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', '遠征2', 'テスト競技場', '2030-08-10', '2000-01-01');
insert into public.match_records (user_id, fixture_id, visibility) values
  ('11111111-1111-4111-8111-111111111111', 't-fx2', 'private'),
  ('22222222-2222-4222-8222-222222222222', 't-fx2', 'public');

select ok(
  (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.user_settings'::regclass, 'public.trips'::regclass, 'public.match_records'::regclass)),
  '個人データの3つの表すべてで RLS が有効');

-- 未ログイン：触れない
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select 1 from public.user_settings$$, '42501', null, '未ログイン：設定を読めない');
select throws_ok($$select 1 from public.trips$$, '42501', null, '未ログイン：遠征予定を読めない');
select throws_ok($$select 1 from public.match_records$$, '42501', null, '未ログイン：観戦記録を読めない');

-- テスター1
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","app_metadata":{}}';
select results_eq('select count(*) from public.trips', array[1::bigint], 'テスター1：自分の遠征予定だけ見える');
select results_eq('select count(*) from public.user_settings', array[1::bigint], 'テスター1：自分の設定だけ見える');
select results_eq('select count(*) from public.match_records', array[1::bigint], 'テスター1：自分の観戦記録だけ見える（他人の public の記録も見えない）');
select is_empty($$update public.trips set memo = 'x' where user_id = '22222222-2222-4222-8222-222222222222' returning 1$$, 'テスター1：他人の遠征予定を書き換えられない');
select is_empty($$delete from public.match_records where user_id = '22222222-2222-4222-8222-222222222222' returning 1$$, 'テスター1：他人の観戦記録を消せない');
select is_empty($$update public.user_settings set origin_station = 'x' where user_id = '22222222-2222-4222-8222-222222222222' returning 1$$, 'テスター1：他人の設定を書き換えられない');
select lives_ok($$insert into public.trips (title, custom_venue, custom_date) values ('新しい遠征', 'テスト競技場', '2030-09-01')$$, 'テスター1：user_id を省いた遠征予定は自分のものとして入る');
select results_eq($$select user_id from public.trips where title = '新しい遠征'$$, $$values ('11111111-1111-4111-8111-111111111111'::uuid)$$, 'テスター1：省いた user_id は自分の id になる');
select throws_ok($$insert into public.trips (user_id, title, custom_venue, custom_date) values ('22222222-2222-4222-8222-222222222222', '他人の遠征', 'x', '2030-09-01')$$, '42501', null, 'テスター1：他人の遠征予定を作れない');
select throws_ok($$update public.trips set user_id = '22222222-2222-4222-8222-222222222222' where id = '00000000-0000-4000-8000-000000000001'$$, '42501', null, 'テスター1：自分の遠征予定を他人のものに付け替えられない');
select throws_ok($$insert into public.match_records (fixture_id, trip_id) values ('t-fx3', '00000000-0000-4000-8000-000000000002')$$, '42501', null, 'テスター1：観戦記録を他人の遠征予定にひも付けられない');
select lives_ok($$insert into public.match_records (fixture_id, trip_id) values ('t-fx4', '00000000-0000-4000-8000-000000000001')$$, 'テスター1：観戦記録を自分の遠征予定にひも付けられる');
select throws_ok($$update public.match_records set trip_id = '00000000-0000-4000-8000-000000000002' where fixture_id = 't-fx2'$$, '42501', null, 'テスター1：あとから他人の遠征予定にひも付け直せない');

-- updated_at はトリガーで更新される（D12）
update public.trips set memo = 'メモ' where id = '00000000-0000-4000-8000-000000000001';
reset role;
select is((select updated_at from public.trips where id = '00000000-0000-4000-8000-000000000001'), now(), '遠征予定を更新すると updated_at が今になる');

-- service_role には個人データの権限を与えない
select ok(not has_table_privilege('service_role', 'public.trips', 'select'), 'service_role は遠征予定を読めない（Edge Function は個人データを使わない）');

select * from finish();
rollback;
