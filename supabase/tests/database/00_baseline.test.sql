-- 新しい表・関数に、自動で権限が付かないこと（設計書 4.3、D7）
-- 本番は「新しい表の自動公開」をオフにしているので、ローカルも同じ状態でテストする
begin;
select plan(6);

create table public.t_probe (id int);
create function public.t_probe_fn() returns int language sql as 'select 1';

select ok(not has_table_privilege('anon', 'public.t_probe', 'select'), '新しい表：anon は読めない');
select ok(not has_table_privilege('authenticated', 'public.t_probe', 'select'), '新しい表：authenticated は読めない');
select ok(not has_table_privilege('service_role', 'public.t_probe', 'select'), '新しい表：service_role も明示の grant がなければ読めない');
select ok(not has_table_privilege('anon', 'public.t_probe', 'truncate'), '新しい表：anon は空にできない（TRUNCATE は RLS で止まらない）');
select ok(not has_function_privilege('anon', 'public.t_probe_fn()', 'execute'), '新しい関数：anon は実行できない');
select ok(not has_function_privilege('authenticated', 'public.t_probe_fn()', 'execute'), '新しい関数：authenticated は実行できない');

select * from finish();
rollback;
