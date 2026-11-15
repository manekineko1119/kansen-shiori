-- 松本山雅FCのチームカラーを公式のクラブカラー（J.League Brand Guide 2026/27：Primary #00823E・Gradient Shade #005612）にする（設計書 3.6）
-- shade はきっぷのグラデーションの終わりと、緑の文字の色に使う
update public.clubs
set theme_colors = '{"primary":"#00823E","on_primary":"#FFFFFF","accent":"#F2B01E","tint":"#D9ECE2","shade":"#005612"}'::jsonb
where id = 'matsumoto';
