-- 初期データ（seed.sql）が入っていること（設計書 11.4、D8）。supabase db reset で seed が入った状態で動かす
begin;
select plan(5);

select results_eq($$select id from public.seasons where is_current$$, $$values ('2026-27')$$, '今のシーズンは 2026-27');
select isnt_empty($$select 1 from public.clubs c join public.stadiums s on s.id = c.home_stadium_id where c.id = 'matsumoto'$$, '松本山雅FCとホームスタジアムがある');
select isnt_empty($$select 1 from public.season_clubs where season_id = '2026-27' and competition = 'J3' and club_id = 'matsumoto'$$, '松本山雅FCは 2026-27 の J3 に所属');
select is((select jsonb_typeof(stations) from public.stadiums where id = 'sunpro-alwin'), 'array', 'スタジアムの駅は JSON の配列として入っている');

select results_eq($$select count(*) from public.season_clubs where season_id = '2026-27' and competition = 'J3'$$, array[20::bigint], '2026-27 の J3 は20クラブ');

select * from finish();
rollback;
