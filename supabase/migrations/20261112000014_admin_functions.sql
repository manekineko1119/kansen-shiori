-- 管理画面の「テスター」のアカウントの有無と「写真の使用量」を読む関数（設計書 3.4・4.3、D36）
-- auth.users と他人の storage.objects は RLS で読めないので、security definer の関数で読む。
-- 呼べるのは authenticated だけ。中で public.is_admin() でなければ例外（42501）にし、管理者以外には何も返さない。
-- search_path は空にし、名前はすべてスキーマ付きで書く

-- 許可リストの各行と、そのメールアドレスのアカウントがもうあるか（大文字・小文字は区別しない）
create function public.admin_allowed_emails()
returns table (email text, note text, created_at timestamptz, has_account boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '権限がありません' using errcode = '42501';
  end if;
  return query
    select a.email, a.note, a.created_at,
           exists (select 1 from auth.users u where lower(u.email) = a.email) as has_account
      from public.allowed_emails a
     order by a.created_at, a.email;
end;
$$;

-- 観戦記録の写真（record-photos）の大きさの合計（バイト）。1枚もなければ 0
create function public.admin_photo_usage()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '権限がありません' using errcode = '42501';
  end if;
  return (select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
            from storage.objects o
           where o.bucket_id = 'record-photos');
end;
$$;

revoke all on function public.admin_allowed_emails() from public, anon;
revoke all on function public.admin_photo_usage() from public, anon;
grant execute on function public.admin_allowed_emails() to authenticated;
grant execute on function public.admin_photo_usage() to authenticated;
