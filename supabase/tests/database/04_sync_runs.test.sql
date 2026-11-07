-- 取り込みの記録 sync_runs の権限（設計書 6.2）
-- 書くのは Edge Function（service_role）だけ。読めるのは管理者だけ
begin;
select plan(8);

-- Edge Function（service_role）
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select lives_ok($$insert into public.sync_runs (job, ok, list_read, pages_read) values ('results', true, 1, 3)$$, 'service_role：取り込みの記録を書ける');
select throws_ok($$insert into public.sync_runs (job, ok) values ('x', true)$$, '23514', null, 'service_role：取り込みの種類は results か videos だけ');
select lives_ok($$insert into public.sync_runs (job, ok, message) values ('videos', false, 'テスト')$$, 'service_role：読んだ数を省いても書ける');
select results_eq($$select list_read, pages_read from public.sync_runs where job = 'videos'$$, $$values (0::smallint, 0::smallint)$$, '省いた読んだ数は0になる');

-- 管理者
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","app_metadata":{"role":"admin"}}';
select results_eq('select count(*) from public.sync_runs', array[2::bigint], '管理者：取り込みの記録を読める');
select throws_ok($$insert into public.sync_runs (job, ok) values ('results', true)$$, '42501', null, '管理者でもアプリからは書けない');

-- テスター
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","app_metadata":{}}';
select is_empty('select 1 from public.sync_runs', 'テスター：取り込みの記録を読めない');

-- 未ログイン
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok('select 1 from public.sync_runs', '42501', null, '未ログイン：取り込みの記録を読めない');

select * from finish();
rollback;
