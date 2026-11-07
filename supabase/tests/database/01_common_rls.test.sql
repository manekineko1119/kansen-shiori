-- 共通データ（stadiums, clubs, seasons, season_clubs, fixtures, fixture_videos）の権限（設計書 4.1・4.3）
-- 読みは全員、書きは管理者（is_admin()）と Edge Function（service_role）だけ
begin;
select plan(24);

-- 準備（postgres のまま入れる）
insert into public.stadiums (id, name, prefecture, address, lat, lng)
  values ('t-stadium', 'テスト競技場', '長野県', '長野県テスト市1-1', 36.2, 137.9);
insert into public.stadiums (id, name, prefecture, address, lat, lng, updated_at)
  values ('t-stadium2', 'テスト競技場2', '長野県', '長野県テスト市2-2', 36.2, 137.9, '2000-01-01');
insert into public.clubs (id, name, short_name, home_stadium_id) values
  ('t-home', 'テストホームFC', 'ホーム', 't-stadium'),
  ('t-away', 'テストアウェイFC', 'アウェイ', null);
insert into public.seasons (id, starts_on, ends_on) values ('t-season', '2030-08-01', '2031-05-31');
insert into public.season_clubs (season_id, competition, club_id) values ('t-season', 'J3', 't-home');
insert into public.fixtures (id, season_id, competition, round, match_date, home_club_id, away_club_id)
  values ('t-fx', 't-season', 'J3', '1', '2030-08-10', 't-home', 't-away');
insert into public.fixture_videos (fixture_id, kind, url, source)
  values ('t-fx', 'highlight', 'https://www.youtube.com/watch?v=t', 'api');

-- RLS
select ok(
  (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.stadiums'::regclass, 'public.clubs'::regclass, 'public.seasons'::regclass,
    'public.season_clubs'::regclass, 'public.fixtures'::regclass, 'public.fixture_videos'::regclass)),
  '共通データの6つの表すべてで RLS が有効');

-- 未ログイン：読める・書けない
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select isnt_empty($$select 1 from public.stadiums where id = 't-stadium'$$, '未ログイン：スタジアムを読める');
select isnt_empty($$select 1 from public.clubs where id = 't-home'$$, '未ログイン：クラブを読める');
select isnt_empty($$select 1 from public.seasons where id = 't-season'$$, '未ログイン：シーズンを読める');
select isnt_empty($$select 1 from public.season_clubs where season_id = 't-season'$$, '未ログイン：所属を読める');
select isnt_empty($$select 1 from public.fixtures where id = 't-fx'$$, '未ログイン：日程を読める');
select isnt_empty($$select 1 from public.fixture_videos where fixture_id = 't-fx'$$, '未ログイン：試合動画を読める');
select throws_ok($$insert into public.clubs (id, name, short_name) values ('t-x', 'x', 'x')$$, '42501', null, '未ログイン：クラブを足せない');
select throws_ok($$update public.fixtures set home_score = 9 where id = 't-fx'$$, '42501', null, '未ログイン：試合の情報を書けない');

-- テスター：読める・書けない
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","app_metadata":{}}';
select isnt_empty($$select 1 from public.fixtures where id = 't-fx'$$, 'テスター：日程を読める');
select throws_ok($$insert into public.clubs (id, name, short_name) values ('t-x', 'x', 'x')$$, '42501', null, 'テスター：クラブを足せない');
select is_empty($$update public.fixtures set home_score = 9 where id = 't-fx' returning 1$$, 'テスター：試合の情報を書き換えられない');
select is_empty($$delete from public.fixture_videos where fixture_id = 't-fx' returning 1$$, 'テスター：試合動画を消せない');
select is_empty($$update public.seasons set is_current = true where id = 't-season' returning 1$$, 'テスター：シーズンを書き換えられない');
select throws_ok($$truncate public.fixtures cascade$$, '42501', null, 'テスター：日程を空にできない');

-- 管理者：書ける
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","app_metadata":{"role":"admin"}}';
select lives_ok($$insert into public.clubs (id, name, short_name) values ('t-new', '新しいFC', '新') $$, '管理者：クラブを足せる');
select results_eq($$update public.fixtures set home_score = 2 where id = 't-fx' returning home_score$$, $$values (2::smallint)$$, '管理者：試合の情報を書ける');
select results_eq($$delete from public.fixture_videos where fixture_id = 't-fx' returning kind$$, $$values ('highlight')$$, '管理者：試合動画を消せる');

-- Edge Function（service_role）：書ける
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select results_eq($$update public.fixtures set away_score = 1 where id = 't-fx' returning away_score$$, $$values (1::smallint)$$, 'service_role：試合の情報を書ける');
select lives_ok($$insert into public.fixture_videos (fixture_id, kind, url, source) values ('t-fx', 'inside', 'https://www.youtube.com/watch?v=u', 'api')$$, 'service_role：試合動画を登録できる');

-- updated_at はトリガーで更新される（D12）
reset role;
update public.stadiums set name = 'テスト競技場2改' where id = 't-stadium2';
select is((select updated_at from public.stadiums where id = 't-stadium2'), now(), 'スタジアムを更新すると updated_at が今になる');

-- 関数の権限
select ok(has_function_privilege('anon', 'public.is_admin()', 'execute'), 'anon は is_admin() を実行できる（ポリシーで使う）');
select ok(not has_function_privilege('anon', 'public.set_updated_at()', 'execute'), 'anon は set_updated_at() を直接実行できない');

-- 今のシーズンは1つだけ
select throws_ok($$insert into public.seasons (id, starts_on, ends_on, is_current) values ('t-s1', '2040-08-01', '2041-05-31', true), ('t-s2', '2041-08-01', '2042-05-31', true)$$, '23505', null, '「今のシーズン」は1つだけ');

select * from finish();
rollback;
