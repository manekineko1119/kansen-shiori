-- 取り込みの記録（設計書 6.2）
-- 実行ごとに1行。書くのは Edge Function（service_role）だけ。管理画面で管理者が読む
create table public.sync_runs (
  id          bigint generated always as identity primary key,
  job         text not null check (job in ('results','videos')),
  ran_at      timestamptz not null default now(),
  ok          boolean not null,
  message     text,                         -- 失敗の理由、照合できなかった試合など
  list_read   smallint not null default 0,  -- 一覧ページを読んだ回数（1日の上限の計算用）
  pages_read  smallint not null default 0   -- 試合ページを読んだ数
);

alter table public.sync_runs enable row level security;
create policy admin_read on public.sync_runs for select to authenticated using ((select public.is_admin()));
-- 書き込みのポリシーは作らない（service_role は RLS を通らずに書く。アプリからは書かない）

grant select on public.sync_runs to authenticated;
grant select, insert on public.sync_runs to service_role;
