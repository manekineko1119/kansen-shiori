-- 地図だけのシーズン（地図の spec 3.3）。昔のシーズン（'2025'・'2026-special'）は、地図で手で足すときのシーズンとしてだけ使い、
-- 観戦記録・管理画面のシーズンの選択肢には出さない（画面側は map_only = true を除く）。地図だけのシーズンは今のシーズンにしない
alter table public.seasons
  add column map_only boolean not null default false;

alter table public.seasons
  add constraint seasons_map_only_not_current check (not (map_only and is_current));
