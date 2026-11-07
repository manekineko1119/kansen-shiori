-- Supabase がプロジェクトを作ったときに入れる public.rls_auto_enable()（新しい表の RLS を自動でオンにする
-- イベントトリガー ensure_rls の関数）は、既定で誰でも実行できる。/rest/v1/rpc から呼べないよう、
-- 実行権限を取り上げる（設計書 4.3、D13）。イベントトリガーとしての動きは変わらない。
-- ローカルの DB にはこの関数がないので、あるときだけ取り上げる
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;
