alter table public.commerce_profiles
  add column if not exists profile_image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-images', 'profile-images', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists bud_profile_images_public_read on storage.objects;
create policy bud_profile_images_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'profile-images');

drop policy if exists bud_profile_images_insert_own on storage.objects;
create policy bud_profile_images_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists bud_profile_images_update_own on storage.objects;
create policy bud_profile_images_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
