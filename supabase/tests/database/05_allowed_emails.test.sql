-- 許可リスト allowed_emails と、アカウント作成を止めるフックの関数（設計書 7.1、D10）
-- 許可リストは管理者だけが読み書きできる。フック（supabase_auth_admin）は読むだけ
begin;
select plan(20);

insert into public.allowed_emails (email) values ('invited@example.test');

-- フックの関数：許可リストにあれば {}、なければエラー（大文字・前後の空白はそろえる）
select is(public.hook_before_user_created('{"user":{"email":"invited@example.test"}}'), '{}'::jsonb, '許可リストのアドレスは {}');
select is(public.hook_before_user_created('{"user":{"email":"Invited@Example.test"}}'), '{}'::jsonb, '大文字が混じっても同じアドレスとして通す');
select is(public.hook_before_user_created('{"user":{"email":" invited@example.test "}}'), '{}'::jsonb, '前後の空白は取ってから照合する');
select is(public.hook_before_user_created('{"user":{"email":"other@example.test"}}'),
  '{"error":{"http_code":403,"message":"招待されていないアカウントです"}}'::jsonb, '許可リストにないアドレスは 403 のエラー');
select is(public.hook_before_user_created('{"user":{}}'),
  '{"error":{"http_code":403,"message":"招待されていないアカウントです"}}'::jsonb, 'メールが欠けていたら拒否');
select is(public.hook_before_user_created('{"user":{"email":""}}'),
  '{"error":{"http_code":403,"message":"招待されていないアカウントです"}}'::jsonb, 'メールが空なら拒否');
select is(public.hook_before_user_created('{}'),
  '{"error":{"http_code":403,"message":"招待されていないアカウントです"}}'::jsonb, 'user がなければ拒否');

-- 関数と表の権限
select ok(not has_function_privilege('anon', 'public.hook_before_user_created(jsonb)', 'execute'), 'anon はフックの関数を実行できない');
select ok(not has_function_privilege('authenticated', 'public.hook_before_user_created(jsonb)', 'execute'), 'authenticated はフックの関数を実行できない');
select ok(has_function_privilege('supabase_auth_admin', 'public.hook_before_user_created(jsonb)', 'execute'), 'supabase_auth_admin はフックの関数を実行できる');
select ok(has_table_privilege('supabase_auth_admin', 'public.allowed_emails', 'select'), 'supabase_auth_admin は許可リストを読める');
select ok(not has_table_privilege('supabase_auth_admin', 'public.allowed_emails', 'insert'), 'supabase_auth_admin は許可リストに書けない');
select ok(exists (select 1 from pg_policy where polrelid = 'public.allowed_emails'::regclass
  and polroles @> array['supabase_auth_admin'::regrole::oid] and polcmd = 'r'), 'supabase_auth_admin 用の読み取りのポリシーがある');

-- 未ログイン
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok('select 1 from public.allowed_emails', '42501', null, '未ログイン：許可リストを読めない');

-- テスター
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","app_metadata":{}}';
select is_empty('select 1 from public.allowed_emails', 'テスター：許可リストを読めない');
select throws_ok($$insert into public.allowed_emails (email) values ('me@example.test')$$, '42501', null, 'テスター：自分を許可リストに入れられない');

-- 管理者
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","app_metadata":{"role":"admin"}}';
select lives_ok($$insert into public.allowed_emails (email, note) values ('new@example.test', 'テスト')$$, '管理者：許可リストに足せる');
select results_eq('select count(*) from public.allowed_emails', array[2::bigint], '管理者：許可リストを読める');
select throws_ok($$insert into public.allowed_emails (email) values ('Upper@example.test')$$, '23514', null, '管理者でも大文字のアドレスは入れられない（小文字にそろえて入れる）');
select results_eq($$delete from public.allowed_emails where email = 'new@example.test' returning email$$, $$values ('new@example.test')$$, '管理者：許可リストから消せる');

select * from finish();
rollback;
