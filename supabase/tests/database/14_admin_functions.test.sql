-- 管理画面の関数 admin_allowed_emails・admin_photo_usage（設計書 3.4・4.3、D36）
-- 管理者だけが呼べ、テスター・未ログインは例外（42501）。未ログインには実行の権限もない
-- メールアドレスはすべて架空のもの（example.test）
begin;
select plan(17);

-- 準備（postgres のまま入れる）。ローカルで足した行があっても数がずれないように消す（rollback で戻る）
delete from public.allowed_emails;
insert into public.allowed_emails (email, note, created_at) values
  ('joined@example.test', 'ログイン済み', '2030-01-01T00:00:00Z'),
  ('waiting@example.test', null, '2030-01-02T00:00:00Z');
-- アカウント側のメールは大文字が混じっていても同じ人として数える
insert into auth.users (id, email) values ('33333333-3333-4333-8333-333333333333', 'Joined@Example.test');

create temp table t_base as
  select coalesce(sum((metadata ->> 'size')::bigint), 0)::bigint as bytes from storage.objects where bucket_id = 'record-photos';
grant select on t_base to authenticated;

-- 関数の作り
select is((select prosecdef from pg_proc where oid = 'public.admin_allowed_emails()'::regprocedure), true, 'admin_allowed_emails は security definer');
select is((select prosecdef from pg_proc where oid = 'public.admin_photo_usage()'::regprocedure), true, 'admin_photo_usage は security definer');
select is((select proconfig from pg_proc where oid = 'public.admin_allowed_emails()'::regprocedure), array['search_path=""'], 'admin_allowed_emails の search_path は空');
select is((select proconfig from pg_proc where oid = 'public.admin_photo_usage()'::regprocedure), array['search_path=""'], 'admin_photo_usage の search_path は空');

-- 実行の権限
select ok(not has_function_privilege('anon', 'public.admin_allowed_emails()', 'execute'), '未ログインは admin_allowed_emails の実行の権限がない');
select ok(not has_function_privilege('anon', 'public.admin_photo_usage()', 'execute'), '未ログインは admin_photo_usage の実行の権限がない');
select ok(has_function_privilege('authenticated', 'public.admin_allowed_emails()', 'execute'), 'ログインした人は admin_allowed_emails を実行できる（中で管理者か確かめる）');
select ok(has_function_privilege('authenticated', 'public.admin_photo_usage()', 'execute'), 'ログインした人は admin_photo_usage を実行できる（中で管理者か確かめる）');

-- 管理者
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","app_metadata":{"role":"admin"}}';
select results_eq($$select email, note, has_account from public.admin_allowed_emails()$$,
  $$values ('joined@example.test', 'ログイン済み', true), ('waiting@example.test', null, false)$$,
  '管理者：許可リストの行と、アカウントの有無（大文字・小文字は区別しない）。追加の古い順');
select results_eq($$select created_at from public.admin_allowed_emails() limit 1$$,
  $$values ('2030-01-01T00:00:00Z'::timestamptz)$$, '管理者：追加日も返る');
-- 写真を足す前：null ではなく、今の合計（db reset の直後なら 0）
select is(public.admin_photo_usage(), (select bytes from t_base), '管理者：写真を足す前は今の合計（0 件なら 0。null にならない）');
reset role;
insert into storage.objects (bucket_id, name, metadata) values
  ('record-photos', '11111111-1111-4111-8111-111111111111/t-a.jpg', '{"size": 300000}'),
  ('record-photos', '22222222-2222-4222-8222-222222222222/t-b.jpg', '{"size": 200000}'),
  ('record-photos', '22222222-2222-4222-8222-222222222222/t-c.jpg', '{}');
set local role authenticated;
select is(public.admin_photo_usage() - (select bytes from t_base), 500000::bigint,
  '管理者：他人のフォルダも含めた写真の大きさの合計（大きさのない行は数えない）');

-- テスター
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","app_metadata":{}}';
select throws_ok('select * from public.admin_allowed_emails()', '42501', null, 'テスター：admin_allowed_emails は拒否');
select throws_ok('select public.admin_photo_usage()', '42501', null, 'テスター：admin_photo_usage は拒否');
-- app_metadata を本人が書ける user_metadata で装っても通らない
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","app_metadata":{},"user_metadata":{"role":"admin"}}';
select throws_ok('select * from public.admin_allowed_emails()', '42501', null, 'テスター：user_metadata の role では拒否');

-- 未ログイン（実行の権限がない）
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok('select * from public.admin_allowed_emails()', '42501', null, '未ログイン：admin_allowed_emails は拒否');
select throws_ok('select public.admin_photo_usage()', '42501', null, '未ログイン：admin_photo_usage は拒否');

select * from finish();
rollback;
