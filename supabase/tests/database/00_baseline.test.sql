-- 新しい表・関数に、自動で権限が付かないこと（設計書 4.3、D7）
-- 本番は「新しい表の自動公開」をオフにしているので、ローカルも同じ状態でテストする
begin;
select plan(8);

create table public.t_probe (id int);
create function public.t_probe_fn() returns int language sql as 'select 1';

select ok(not has_table_privilege('anon', 'public.t_probe', 'select'), '新しい表：anon は読めない');
select ok(not has_table_privilege('authenticated', 'public.t_probe', 'select'), '新しい表：authenticated は読めない');
select ok(not has_table_privilege('service_role', 'public.t_probe', 'select'), '新しい表：service_role も明示の grant がなければ読めない');
select ok(not has_table_privilege('anon', 'public.t_probe', 'truncate'), '新しい表：anon は空にできない（TRUNCATE は RLS で止まらない）');
select ok(not has_function_privilege('anon', 'public.t_probe_fn()', 'execute'), '新しい関数：anon は実行できない');
select ok(not has_function_privilege('authenticated', 'public.t_probe_fn()', 'execute'), '新しい関数：authenticated は実行できない');

-- public の関数で、未ログインが実行できるのは is_admin() だけ。ログイン済みの人は、それに管理画面の2つの関数を足したものだけ
-- （管理画面の関数は中で is_admin() でなければ例外。14 で確かめる。D36）
-- （Supabase がプロジェクトを作ったときに入れる rls_auto_enable() なども含めて見る。設計書 4.3、D13）
select is(
  (select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
  array['is_admin()'],
  'public の関数で anon が実行できるのは is_admin() だけ');
select is(
  (select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')),
  array['admin_allowed_emails()', 'admin_photo_usage()', 'is_admin()'],
  'public の関数で authenticated が実行できるのは is_admin() と管理画面の2つの関数だけ');

select * from finish();
rollback;
