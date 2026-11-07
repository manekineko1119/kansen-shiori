-- 招待の許可リストと、アカウント作成を止めるフックの関数（設計書 7.1、D10）
-- テスターのメールアドレスは DB にだけ置く（リポジトリ・seed には書かない）

create table public.allowed_emails (
  email       text primary key check (email = lower(email)),
  note        text,                     -- 誰か分かるメモ
  created_at  timestamptz not null default now()
);

alter table public.allowed_emails enable row level security;
create policy admin_all on public.allowed_emails for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
-- フック（supabase_auth_admin）からは読むだけ
create policy auth_admin_read on public.allowed_emails for select to supabase_auth_admin using (true);

grant select, insert, update, delete on public.allowed_emails to authenticated;
grant select on public.allowed_emails to supabase_auth_admin;

-- Before User Created フック：アカウントを作る直前に Supabase Auth が呼ぶ
-- メールを小文字にそろえ、前後の空白を取って許可リストと照らす。なければ（空・欠けを含む）作成を止める
create function public.hook_before_user_created(event jsonb) returns jsonb
  language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_email text := lower(trim(event -> 'user' ->> 'email'));
begin
  if v_email is not null and v_email <> ''
     and exists (select 1 from public.allowed_emails where email = v_email) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', '招待されていないアカウントです'));
end;
$$;

grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from anon, authenticated, public;
