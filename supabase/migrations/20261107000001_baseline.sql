-- 新しい表・関数・シーケンスに、自動で権限を付けない（設計書 4.3、D7）
-- 本番は「新しい表の自動公開」をオフにしてある。ローカルの DB も同じ状態にするため、ここで取り上げる。
-- 以後のマイグレーションでは、表・関数ごとに必要な権限だけを grant する（RLS のポリシーと二重に守る）。

-- 表・シーケンス・関数：anon・authenticated・service_role に何も付けない
-- （select などだけでなく truncate・references・trigger も。TRUNCATE は RLS で止まらないため all にする）
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;

-- 関数の実行の権限は、PostgreSQL がもともと全員（PUBLIC）に与えている。
-- schema を指定した既定の権限では取り上げられないので、schema を指定せずに取り上げる。
alter default privileges for role postgres
  revoke execute on functions from public;
