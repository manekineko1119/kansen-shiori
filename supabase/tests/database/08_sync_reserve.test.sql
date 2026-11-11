-- 取り込みの回数の予約（設計書 6.2、D21）
-- 同時に2つの実行が走っても1日の上限（一覧2回・試合ページ10件）を超えないよう、読む前に回数を押さえる
begin;
select plan(18);

-- 列
select col_not_null('public', 'sync_runs', 'running', 'running は空にできない');
select col_default_is('public', 'sync_runs', 'running', 'false', 'running の既定は false');

-- A：空の日に3回予約する（日本時間 11/10 の 0 時＝ UTC 11/9 15:00 から数える）
delete from public.sync_runs;  -- ローカルで動かした記録が残っていても数がずれないように（rollback で戻る）
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select results_eq($$select pages_allowed from public.sync_reserve_run('results', '2026-11-09T15:00:00Z', 2, 10, 5)$$,
  $$values (5)$$, '1回目：試合ページを5件まで予約できる');
select results_eq($$select running, ok, list_read, pages_read, message from public.sync_runs$$,
  $$values (true, false, 1::smallint, 5::smallint, '実行中')$$, '予約の行が入る');
-- 実行中の行があると予約できない（13_sync_running）ので、1回目を予約どおりの回数で終わりにしてから2回目を予約する
select ok(public.sync_finish_run((select id from public.sync_runs where running), true, null, 1, 5), '1回目を終わりにする');
select results_eq($$select pages_allowed from public.sync_reserve_run('results', '2026-11-09T15:00:00Z', 2, 10, 5)$$,
  $$values (5)$$, '2回目：残りの5件');
select ok(public.sync_finish_run((select id from public.sync_runs where running), true, null, 1, 5), '2回目を終わりにする');
select is_empty($$select * from public.sync_reserve_run('results', '2026-11-09T15:00:00Z', 2, 10, 5)$$,
  '3回目：一覧の上限（2回）なので予約できない');

-- B：前日の行・動画の行は数えない。試合ページの残りが3件
reset role;
delete from public.sync_runs;
insert into public.sync_runs (job, ok, list_read, pages_read, ran_at) values
  ('results', true, 2, 10, '2026-11-09T10:00:00Z'),
  ('videos', true, 2, 0, '2026-11-09T16:00:00Z'),
  ('results', true, 1, 7, '2026-11-09T16:00:00Z');
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select results_eq($$select pages_allowed from public.sync_reserve_run('results', '2026-11-09T15:00:00Z', 2, 10, 5)$$,
  $$values (3)$$, '前日・動画の行は数えず、試合ページは残りの3件だけ予約する');

-- 終わったら本当の回数に直す。予約より多くはしない。終わった行は直さない
select ok(public.sync_finish_run((select id from public.sync_runs where running), true, null, 1, 9),
  '実行中の行を終わりにすると true');
select results_eq($$select running, ok, list_read, pages_read from public.sync_runs where message is null and job = 'results' and ran_at >= '2026-11-09T15:00:00Z' and pages_read <> 7$$,
  $$values (false, true, 1::smallint, 3::smallint)$$, '終わった行は running が false、試合ページは予約の3件のまま');
select ok(not public.sync_finish_run((select max(id) from public.sync_runs), false, 'x', 1, 0),
  '終わった行はもう直さない');

-- 実行の権限
reset role;
select ok(not has_function_privilege('anon', 'public.sync_reserve_run(text, timestamptz, integer, integer, integer)', 'execute'), '未ログインは予約できない');
select ok(not has_function_privilege('authenticated', 'public.sync_reserve_run(text, timestamptz, integer, integer, integer)', 'execute'), 'ログインした人は予約できない');
select ok(has_function_privilege('service_role', 'public.sync_reserve_run(text, timestamptz, integer, integer, integer)', 'execute'), 'service_role は予約できる');
select ok(not has_function_privilege('anon', 'public.sync_finish_run(bigint, boolean, text, integer, integer)', 'execute'), '未ログインは終わりにできない');
select ok(not has_function_privilege('authenticated', 'public.sync_finish_run(bigint, boolean, text, integer, integer)', 'execute'), 'ログインした人は終わりにできない');
select ok(has_function_privilege('service_role', 'public.sync_finish_run(bigint, boolean, text, integer, integer)', 'execute'), 'service_role は終わりにできる');

select * from finish();
rollback;
