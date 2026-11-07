-- このファイルは npm run seed で supabase/seed-data/ の JSON から作る。手で直さない（設計書 11.4）
-- どの insert も on conflict do nothing なので、もう一度流しても管理者が直した値は上書きしない

-- stadiums
insert into public.stadiums (id, name, prefecture, address, lat, lng, stations, airports, access_url, shuttle_note, parking_note, agoda_area, verified_at) values ('sunpro-alwin', 'サンプロ アルウィン', '長野県', '長野県松本市神林5300 松本平広域公園内', 36.1797028, 137.9171639, '[{"name":"松本","kind":"shuttle","walk_min":null,"note":"松本バスターミナル（松本駅から徒歩3分）から無料シャトルバス約30分。往路はキックオフの4時間前〜45分前に30分おき","toyoko":[{"hotel":"00314","name":"東横INN松本駅東口","walk_min":3},{"hotel":"00102","name":"東横INN松本駅前本町","walk_min":6}]},{"name":"村井","kind":"nearest","walk_min":90,"note":"徒歩約1時間30分（4.7km）","toyoko":[]}]'::jsonb, '[]'::jsonb, 'https://www.yamaga-fc.com/stadium/access', '無料シャトルバスは松本バスターミナル発（往路：キックオフの4時間前〜45分前に30分おき、復路：試合終了後〜1時間後まで）。有料予約制バス（アルピコプラザホテル前発）もある。試合ごとに変わるので、松本山雅FC公式の「アクセス情報」で確かめる', '大芝生駐車場（約2,000台）など。試合によって使える駐車場が変わり、満車の情報は松本山雅FC公式Xで出る', '{"type":"city","id":23118,"name":"松本"}'::jsonb, '2026-11-07') on conflict do nothing;

-- clubs
insert into public.clubs (id, name, short_name, aliases, official_url, jleague_url, home_stadium_id, theme_colors, video_sources) values ('matsumoto', '松本山雅FC', '松本', array['松本山雅']::text[], 'https://www.yamaga-fc.com/', 'https://www.jleague.jp/club/matsumoto/', 'sunpro-alwin', '{"primary":"#0E5A3A","on_primary":"#FFFFFF","accent":"#F2B01E","tint":"#D9E8DF"}'::jsonb, '[{"channel":"@yamagachannel","kinds":{"highlight":["明治安田"],"inside":["【INSIDE】"]}}]'::jsonb) on conflict do nothing;

-- seasons
insert into public.seasons (id, starts_on, ends_on, is_current) values ('2026-27', '2026-08-08', '2027-05-23', true) on conflict do nothing;

-- season_clubs
insert into public.season_clubs (season_id, competition, club_id) values ('2026-27', 'J3', 'matsumoto') on conflict do nothing;
