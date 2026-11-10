-- 自動取り込みの書き込みの SQL の関数（設計書 6.2・6.3、D15）
-- 手で直した試合・動画（manual）を上書きしない。実行できるのは Edge Function（service_role）だけ
begin;
select plan(30);

-- 準備（postgres のまま入れる）
insert into public.clubs (id, name, short_name) values
  ('t-home', 'テストホームFC', 'ホーム'),
  ('t-away', 'テストアウェイFC', 'アウェイ');
insert into public.seasons (id, starts_on, ends_on) values ('t-season', '2030-08-01', '2031-05-31');
insert into public.fixtures (id, season_id, competition, round, match_date, kickoff, home_club_id, away_club_id) values
  ('t-fx', 't-season', 'J3', '1', '2030-08-10', '14:00', 't-home', 't-away'),
  ('t-fx3', 't-season', 'J3', '3', '2030-08-24', '14:00', 't-home', 't-away');
insert into public.fixtures (id, season_id, competition, round, match_date, home_club_id, away_club_id, status, home_score, away_score, result_source, jleague_match_url) values
  ('t-fxm', 't-season', 'J3', '2', '2030-08-17', 't-home', 't-away', 'finished', 1, 2, 'manual', null),
  ('t-fxm2', 't-season', 'J3', '4', '2030-08-31', 't-home', 't-away', 'finished', 1, 2, 'manual', 'https://example.test/old/');
insert into public.fixture_videos (fixture_id, kind, url, source) values ('t-fxm', 'inside', 'https://youtu.be/m', 'manual');

-- Edge Function（service_role）
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';

-- sync_apply_result
select ok(public.sync_apply_result('t-fx', '{"jleague_match_url":"https://www.jleague.jp/match/j3/2026/102517/","status":"finished","home_score":0,"away_score":2,"result_source":"api","kickoff":"09:00"}'),
  '結果を書き込むと true');
select results_eq($$select status, home_score, away_score, result_source, kickoff, jleague_match_url from public.fixtures where id = 't-fx'$$,
  $$values ('finished', 0::smallint, 2::smallint, 'api', '14:00'::time, 'https://www.jleague.jp/match/j3/2026/102517/')$$,
  '結果と URL が入り、patch の kickoff は無視される');
select isnt((select result_updated_at from public.fixtures where id = 't-fx'), null, '結果を書き換えたら result_updated_at が入る');
select ok(not public.sync_apply_result('t-fx', '{"jleague_match_url":"https://www.jleague.jp/match/j3/2026/102517/","status":"finished","home_score":0,"away_score":2,"result_source":"api"}'),
  '同じ内容をもう一度書くと、何も変わらないので false');
select ok(public.sync_apply_result('t-fxm', '{"jleague_match_url":"https://www.jleague.jp/match/j3/2026/102518/","status":"finished","home_score":0,"away_score":2,"result_source":"api"}'),
  '手入力の試合でも、空の URL を埋めたら true');
select results_eq($$select home_score, away_score, result_source, jleague_match_url, result_updated_at is null from public.fixtures where id = 't-fxm'$$,
  $$values (1::smallint, 2::smallint, 'manual', 'https://www.jleague.jp/match/j3/2026/102518/', true)$$,
  '手入力の試合は結果を書き換えず、URL だけ入る');
select ok(not public.sync_apply_result('t-fxm2', '{"jleague_match_url":"https://www.jleague.jp/match/j3/2026/102519/","status":"finished","home_score":0,"away_score":2,"result_source":"api"}'),
  'URL もある手入力の試合は false');
select results_eq($$select home_score, result_source, jleague_match_url from public.fixtures where id = 't-fxm2'$$,
  $$values (1::smallint, 'manual', 'https://example.test/old/')$$,
  'URL もある手入力の試合は何も変わらない');

-- sync_apply_scorers
select ok(public.sync_apply_scorers('t-fx', '[{"club_id":"t-away","player":"山田 一郎","minute":"18","type":"goal"}]'),
  '得点者を書き込むと true');
select results_eq($$select jsonb_array_length(scorers), scorers_fetched_at is not null, scorers_failed_at is null from public.fixtures where id = 't-fx'$$,
  $$values (1, true, true)$$, '得点者と scorers_fetched_at が入る');
select ok(not public.sync_apply_scorers('t-fx', '[]'), '取り込み済みの試合には2回目を書かない');
select ok(public.sync_apply_scorers('t-fx3', null), '失敗（null）を書き込むと true');
select results_eq($$select scorers, scorers_failed_at is not null, scorers_fetched_at is null from public.fixtures where id = 't-fx3'$$,
  $$values ('[]'::jsonb, true, true)$$, '失敗なら scorers_failed_at が入り、得点者は空のまま');
select ok(not public.sync_apply_scorers('t-fxm', '[{"club_id":"t-away","player":"x","minute":"1","type":"goal"}]'),
  '手入力の試合には得点者を書かない');

-- sync_upsert_video
select ok(public.sync_upsert_video('{"fixture_id":"t-fx","kind":"highlight","url":"https://youtu.be/a","title":"t","channel":"@test","published_at":"2030-08-11T09:00:00Z"}'),
  '新しい動画を入れると true');
select results_eq($$select url, source, channel from public.fixture_videos where fixture_id = 't-fx' and kind = 'highlight'$$,
  $$values ('https://youtu.be/a', 'api', '@test')$$, '自動取り込みの動画として入る');
select ok(public.sync_upsert_video('{"fixture_id":"t-fx","kind":"highlight","url":"https://youtu.be/b","title":"t2","channel":"@test","published_at":"2030-08-12T09:00:00Z"}'),
  '自動取り込みの動画は更新できて true');
select results_eq($$select url from public.fixture_videos where fixture_id = 't-fx' and kind = 'highlight'$$,
  $$values ('https://youtu.be/b')$$, '自動取り込みの動画の URL が新しくなる');
select ok(not public.sync_upsert_video('{"fixture_id":"t-fxm","kind":"inside","url":"https://youtu.be/x","title":"t","channel":"@test","published_at":"2030-08-19T09:00:00Z"}'),
  '手入力の動画には false');
select results_eq($$select url, source from public.fixture_videos where fixture_id = 't-fxm' and kind = 'inside'$$,
  $$values ('https://youtu.be/m', 'manual')$$, '手入力の動画は書き換えない');

-- 実行の権限
reset role;
select ok(not has_function_privilege('anon', 'public.sync_apply_result(text, jsonb)', 'execute'), '未ログインは sync_apply_result を実行できない');
select ok(not has_function_privilege('authenticated', 'public.sync_apply_result(text, jsonb)', 'execute'), 'ログインした人は sync_apply_result を実行できない');
select ok(has_function_privilege('service_role', 'public.sync_apply_result(text, jsonb)', 'execute'), 'service_role は sync_apply_result を実行できる');
select ok(not has_function_privilege('anon', 'public.sync_apply_scorers(text, jsonb)', 'execute'), '未ログインは sync_apply_scorers を実行できない');
select ok(not has_function_privilege('authenticated', 'public.sync_apply_scorers(text, jsonb)', 'execute'), 'ログインした人は sync_apply_scorers を実行できない');
select ok(has_function_privilege('service_role', 'public.sync_apply_scorers(text, jsonb)', 'execute'), 'service_role は sync_apply_scorers を実行できる');
select ok(not has_function_privilege('anon', 'public.sync_upsert_video(jsonb)', 'execute'), '未ログインは sync_upsert_video を実行できない');
select ok(not has_function_privilege('authenticated', 'public.sync_upsert_video(jsonb)', 'execute'), 'ログインした人は sync_upsert_video を実行できない');
select ok(has_function_privilege('service_role', 'public.sync_upsert_video(jsonb)', 'execute'), 'service_role は sync_upsert_video を実行できる');

-- 管理者でも、アプリからは呼べない
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","app_metadata":{"role":"admin"}}';
select throws_ok($$select public.sync_apply_result('t-fx', '{"status":"scheduled"}')$$, '42501', null, '管理者でも sync_apply_result を呼べない');

select * from finish();
rollback;
