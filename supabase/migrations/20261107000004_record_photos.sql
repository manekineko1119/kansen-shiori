-- 観戦記録の写真の保存先（設計書 4.2.1、D9）
-- パス：{user_id}/{fixture_id}.jpg。非公開。1ファイル 1MB まで、JPEG だけ（端末で長辺1600px・品質0.8に縮めてから送る）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('record-photos', 'record-photos', false, 1048576, array['image/jpeg']);

-- 本人のフォルダ（パスの1段目が自分の user_id）だけ読み書きできる
create policy record_photos_own_select on storage.objects for select to authenticated
  using (bucket_id = 'record-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy record_photos_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'record-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy record_photos_own_update on storage.objects for update to authenticated
  using (bucket_id = 'record-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'record-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy record_photos_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'record-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
