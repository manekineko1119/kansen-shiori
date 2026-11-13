-- PK 戦の列・match の記録・URL での登録の回数の予約（設計書 4.1・6.2）
begin;
select plan(17);

-- 列と check
select has_column('public', 'fixtures', 'home_pk', 'fixtures に home_pk がある');
select has_column('public', 'fixtures', 'away_pk', 'fixtures に away_pk がある');

insert into public.clubs (id, name, short_name) values ('t-home', 'テストホームFC', 'ホーム'), ('t-away', 'テストアウェイFC', 'アウェイ');
insert into public.seasons (id, starts_on, ends_on) values ('t-season', '2030-08-01', '2031-05-31');

select lives_ok($$insert into public.fixtures (id, season_id, competition, round, match_date, home_club_id, away_club_id, home_pk, away_pk)
  values ('t-pk1', 't-season', 'cup', '1', '2030-08-10', 't-home', 't-away', 4, 3)$$, 'PK 4-3 は入る');
select throws_ok($$insert into public.fixtures (id, season_id, competition, round, match_date, home_club_id, away_club_id, home_pk, away_pk)
  values ('t-pk2', 't-season', 'cup', '1', '2030-08-10', 't-home', 't-away', 4, null)$$, '23514', null, '片方だけの PK は入らない');
select throws_ok($$insert into public.fixtures (id, season_id, competition, round, match_date, home_club_id, away_club_id, home_pk, away_pk)
  values ('t-pk3', 't-season', 'cup', '1', '2030-08-10', 't-home', 't-away', 3, 3)$$, '23514', null, '同じ PK は入らない');
select throws_ok($$insert into public.fixtures (id, season_id, competition, round, match_date, home_club_id, away_club_id, home_pk, away_pk)
  values ('t-pk4', 't-season', 'cup', '1', '2030-08-10', 't-home', 't-away', -1, 0)$$, '23514', null, '負の PK は入らない');

-- job に match
delete from public.sync_runs;
select lives_ok($$insert into public.sync_runs (job, ok) values ('match', true)$$, 'job = match が入る');

-- 回数の予約：results と match で合計
delete from public.sync_runs;
insert into public.sync_runs (job, ok, message, running, list_read, pages_read) values ('results', true, null, false, 1, 9);
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select ok(public.sync_reserve_match_page(now() - interval '1 hour', 10) is not null, '合計9件のとき1件予約できる');
select results_eq($$select job, running, list_read, pages_read from public.sync_runs where job = 'match'$$,
  $$values ('match'::text, true, 0::smallint, 1::smallint)$$, '予約の行は match・実行中・list_read 0・pages_read 1');
select is(public.sync_reserve_match_page(now() - interval '1 hour', 10), null, '合計10件になったら予約できない');

-- match の回数が results の予約に数えられる
reset role;
delete from public.sync_runs;
insert into public.sync_runs (job, ok, message, running, list_read, pages_read) values ('match', true, null, false, 0, 8);
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select results_eq($$select pages_allowed from public.sync_reserve_run('results', now() - interval '1 hour', 2, 10, 5)$$,
  $$values (2)$$, 'match の8件を数えて results の試合ページは残り2件');

-- 10分を過ぎた match の running は中断になる
reset role;
delete from public.sync_runs;
insert into public.sync_runs (job, ok, message, running, list_read, pages_read, ran_at) values
  ('match', false, '実行中', true, 0, 1, now() - interval '11 minutes');
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select ok(public.sync_reserve_match_page(now() - interval '1 hour', 10) is not null, '止まった match の行があっても予約できる');
select results_eq($$select running, ok, message from public.sync_runs where ran_at < now() - interval '10 minutes'$$,
  $$values (false, false, '中断しました（10分以内に終わりませんでした）')$$, '止まった match の行は中断になる');

-- 権限
reset role;
select ok(not has_function_privilege('anon', 'public.sync_reserve_match_page(timestamptz, integer)', 'execute'), '未ログインは呼べない');
select ok(not has_function_privilege('authenticated', 'public.sync_reserve_match_page(timestamptz, integer)', 'execute'), 'ログインした人は呼べない');
select ok(has_function_privilege('service_role', 'public.sync_reserve_match_page(timestamptz, integer)', 'execute'), 'service_role は呼べる');
set local role authenticated;
select throws_ok($$select public.sync_reserve_match_page(now(), 10)$$, '42501', null, 'authenticated で呼ぶと権限エラー');
reset role;

select * from finish();
rollback;
