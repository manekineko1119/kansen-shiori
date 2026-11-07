-- 写真の保存先 record-photos の権限（設計書 4.2.1、D9）
-- パスは {user_id}/{fixture_id}.jpg。本人のフォルダだけ読み書きできる
begin;
select plan(7);

select results_eq(
  $$select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'record-photos'$$,
  $$values (false, 1048576::bigint, array['image/jpeg'])$$,
  'record-photos は非公開で、1MB まで・JPEG だけ');

-- 準備：テスター2 の写真（postgres のまま入れる）
insert into storage.objects (bucket_id, name)
  values ('record-photos', '22222222-2222-4222-8222-222222222222/t-fx.jpg');

-- テスター1
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","app_metadata":{}}';
select lives_ok($$insert into storage.objects (bucket_id, name) values ('record-photos', '11111111-1111-4111-8111-111111111111/t-fx.jpg')$$, 'テスター1：自分のフォルダに写真を置ける');
select isnt_empty($$select 1 from storage.objects where name = '11111111-1111-4111-8111-111111111111/t-fx.jpg'$$, 'テスター1：自分の写真を読める');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('record-photos', '22222222-2222-4222-8222-222222222222/t-fx2.jpg')$$, '42501', null, 'テスター1：他人のフォルダに写真を置けない');
select is_empty($$select 1 from storage.objects where name like '22222222-2222-4222-8222-222222222222/%'$$, 'テスター1：他人の写真を読めない');
-- storage.objects は SQL で直接消せない（Storage API を使う作り）ので、消す権限は段5 で Storage API から確かめる
select is_empty($$update storage.objects set name = '11111111-1111-4111-8111-111111111111/x.jpg' where name like '22222222-2222-4222-8222-222222222222/%' returning 1$$, 'テスター1：他人の写真を書き換え・横取りできない');

-- 未ログイン
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is_empty($$select 1 from storage.objects where bucket_id = 'record-photos'$$, '未ログイン：写真を1枚も読めない');

select * from finish();
rollback;
