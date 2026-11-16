-- 地図だけのシーズン seasons.map_only（地図の spec 3.3）
begin;
select plan(5);

select has_column('public', 'seasons', 'map_only', 'seasons に map_only の列がある');
select col_not_null('public', 'seasons', 'map_only', 'map_only は null にできない');
select col_default_is('public', 'seasons', 'map_only', 'false', 'map_only の既定は false（ふつうのシーズン）');

-- 準備（postgres のまま入れる）
insert into public.seasons (id, starts_on, ends_on) values ('t-old', '2020-02-01', '2020-12-01');
select is((select map_only from public.seasons where id = 't-old'), false, '列を書かずに足したシーズンは map_only = false');

select throws_ok(
  $$insert into public.seasons (id, starts_on, ends_on, is_current, map_only) values ('t-map', '2019-02-01', '2019-12-01', true, true)$$,
  '23514', null, '地図だけのシーズンは今のシーズンにできない');

select * from finish();
rollback;
