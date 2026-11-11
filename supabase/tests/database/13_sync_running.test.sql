-- 止まった取り込みの中断・実行を1つずつ・上限と実行中で読まなかった回の印（設計書 3.4・6.2、段4 の最後のレビュー、D37）
-- now() はトランザクションの中で変わらないので、ran_at は now() からの差で入れる
begin;
select plan(25);

-- 列：skipped_reason は null・'limit'・'running' だけ
select has_column('public', 'sync_runs', 'skipped_reason', 'sync_runs に skipped_reason がある');
select col_is_null('public', 'sync_runs', 'skipped_reason', 'skipped_reason は空にできる');
select throws_ok($$insert into public.sync_runs (job, ok, skipped_reason) values ('results', false, 'other')$$,
  '23514', null, 'skipped_reason に limit・running 以外は入らない');
select lives_ok($$insert into public.sync_runs (job, ok, skipped_reason) values ('results', false, 'limit'), ('results', false, 'running')$$,
  'skipped_reason に limit・running は入る');

-- A：10分を過ぎた running の行は、予約のときに「中断」になり、回数は上限に数える
delete from public.sync_runs;  -- ローカルで動かした記録が残っていても数がずれないように（rollback で戻る）
insert into public.sync_runs (job, ok, message, running, list_read, pages_read, ran_at) values
  ('results', false, '実行中', true, 1, 5, now() - interval '11 minutes'),
  ('videos', false, '実行中', true, 0, 0, now() - interval '11 minutes');
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select results_eq($$select pages_allowed from public.sync_reserve_run('results', now() - interval '1 hour', 2, 10, 5)$$,
  $$values (5)$$, '10分を過ぎた実行中の行があっても予約でき、試合ページは残りの5件');
select results_eq($$select running, ok, message, skipped_reason, list_read, pages_read from public.sync_runs
    where job = 'results' and ran_at < now() - interval '10 minutes'$$,
  $$values (false, false, '中断しました（10分以内に終わりませんでした）', null::text, 1::smallint, 5::smallint)$$,
  '止まった行は中断になり、予約した回数はそのまま残る');
select results_eq($$select running from public.sync_runs where job = 'videos'$$,
  $$values (true)$$, 'ほかのジョブの行は中断にしない');
select ok(public.sync_finish_run((select id from public.sync_runs where job = 'results' and running), true, null, 1, 5),
  '新しい予約の行を終わりにする');
select is_empty($$select * from public.sync_reserve_run('results', now() - interval '1 hour', 2, 10, 5)$$,
  '中断の行の一覧1回と新しい1回で上限（2回）になり、予約できない');

-- B：10分以内の running の行があれば、予約は0行（実行を1つずつにする）
reset role;
delete from public.sync_runs;
insert into public.sync_runs (job, ok, message, running, list_read, pages_read, ran_at) values
  ('results', false, '実行中', true, 1, 5, now() - interval '9 minutes');
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select is_empty($$select * from public.sync_reserve_run('results', now() - interval '1 hour', 2, 10, 5)$$,
  '10分以内の実行中の行があれば予約は0行');
select results_eq($$select count(*)::int from public.sync_runs$$, $$values (1)$$, '予約の行は入らない');
select results_eq($$select running, message from public.sync_runs$$, $$values (true, '実行中')$$,
  '10分以内の実行中の行は中断にしない');
select is(public.sync_skip_reason('results'), 'running', '読まなかった理由は running');
select is(public.sync_skip_reason('videos'), 'limit', 'ほかのジョブの実行中は数えない（理由は limit）');

-- C：実行中の行が終わったあと・中断になったあとは予約できる
select ok(public.sync_finish_run((select id from public.sync_runs where running), true, null, 1, 0), '実行中の行を終わりにする');
select results_eq($$select pages_allowed from public.sync_reserve_run('results', now() - interval '1 hour', 2, 10, 5)$$,
  $$values (5)$$, '終わったあとは予約できる');
reset role;
delete from public.sync_runs;
insert into public.sync_runs (job, ok, message, running, list_read, pages_read, ran_at) values
  ('results', false, '実行中', true, 1, 2, now() - interval '30 minutes');
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select results_eq($$select pages_allowed from public.sync_reserve_run('results', now() - interval '1 hour', 2, 10, 5)$$,
  $$values (5)$$, '中断のあとは予約できる（試合ページは 10 - 2 と 5 の小さいほう）');
select is(public.sync_skip_reason('results'), 'running', '予約した直後の行は実行中');
reset role;
update public.sync_runs set running = false;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select is(public.sync_skip_reason('results'), 'limit', '実行中の行がなければ理由は limit');

-- D：sync_upsert_video は同じ値なら書き換えない（updated_at も変えない）
reset role;
insert into public.clubs (id, name, short_name) values ('t-home', 'テストホームFC', 'ホーム'), ('t-away', 'テストアウェイFC', 'アウェイ');
insert into public.seasons (id, starts_on, ends_on) values ('t-season', '2030-08-01', '2031-05-31');
insert into public.fixtures (id, season_id, competition, round, match_date, home_club_id, away_club_id)
  values ('t-fv', 't-season', 'J3', '1', '2030-08-10', 't-home', 't-away');
insert into public.fixture_videos (fixture_id, kind, url, title, channel, published_at, source, updated_at)
  values ('t-fv', 'highlight', 'https://youtu.be/a', 't', '@test', '2030-08-11T09:00:00Z', 'api', '2030-08-11T10:00:00Z');
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select is(public.sync_upsert_video('{"fixture_id":"t-fv","kind":"highlight","url":"https://youtu.be/a","title":"t","channel":"@test","published_at":"2030-08-11T09:00:00Z"}'),
  null, '同じ値なら null（書き換えなし。手入力の false と区別する）');
select results_eq($$select updated_at from public.fixture_videos where fixture_id = 't-fv' and kind = 'highlight'$$,
  $$values ('2030-08-11T10:00:00Z'::timestamptz)$$, '同じ値なら updated_at を変えない');
select ok(public.sync_upsert_video('{"fixture_id":"t-fv","kind":"highlight","url":"https://youtu.be/a","title":"t2","channel":"@test","published_at":"2030-08-11T09:00:00Z"}'),
  'タイトルが変われば書き換えて true');

-- 実行の権限
reset role;
select ok(not has_function_privilege('anon', 'public.sync_skip_reason(text)', 'execute'), '未ログインは sync_skip_reason を呼べない');
select ok(not has_function_privilege('authenticated', 'public.sync_skip_reason(text)', 'execute'), 'ログインした人は sync_skip_reason を呼べない');
select ok(has_function_privilege('service_role', 'public.sync_skip_reason(text)', 'execute'), 'service_role は sync_skip_reason を呼べる');

select * from finish();
rollback;
