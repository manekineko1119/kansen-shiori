-- 手で足した「行った会場」stadium_visits の権限（地図の spec 3.1）
-- 本人（user_id = auth.uid()）だけが読み書きできる。anon には権限を与えない
begin;
select plan(9);

-- 準備（postgres のまま入れる）
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 't1@example.test'),
  ('22222222-2222-4222-8222-222222222222', 't2@example.test');
insert into public.stadiums (id, name, prefecture, address, lat, lng) values
  ('t-stadium', 'テスト競技場', '長野県', 'テスト市1-1', 36.0, 137.9);
insert into public.stadium_visits (user_id, stadium_id) values
  ('22222222-2222-4222-8222-222222222222', 't-stadium');

select has_table('public', 'stadium_visits', 'stadium_visits の表がある');
select ok((select relrowsecurity from pg_class where oid = 'public.stadium_visits'::regclass), 'stadium_visits は RLS が有効');

-- 未ログイン：触れない
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select 1 from public.stadium_visits$$, '42501', null, '未ログイン：行った会場を読めない');

-- テスター1
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","app_metadata":{}}';
select lives_ok($$insert into public.stadium_visits (stadium_id) values ('t-stadium')$$, 'テスター1：user_id を省いた insert は自分のものとして入る');
select results_eq('select count(*) from public.stadium_visits', array[1::bigint], 'テスター1：自分の行だけ見える');
select is_empty($$select 1 from public.stadium_visits where user_id = '22222222-2222-4222-8222-222222222222'$$, 'テスター1：他人の行は見えない');
delete from public.stadium_visits where user_id = '22222222-2222-4222-8222-222222222222';
reset role;
select results_eq($$select count(*) from public.stadium_visits where user_id = '22222222-2222-4222-8222-222222222222'$$, array[1::bigint], 'テスター1：他人の行を delete しても消えない');
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","app_metadata":{}}';
select throws_ok($$insert into public.stadium_visits (user_id, stadium_id) values ('22222222-2222-4222-8222-222222222222', 't-stadium')$$, '42501', null, 'テスター1：他人の user_id では insert できない');
select throws_ok($$insert into public.stadium_visits (stadium_id) values ('unknown-stadium')$$, '23503', null, '知らない stadium_id は外部キーで止まる');

select * from finish();
rollback;
