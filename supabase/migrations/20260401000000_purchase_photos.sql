-- =====================================================================
-- T9DYA MANAGER - Photos des achats (Supabase Storage)
--
-- Compatible avec les donnees existantes :
--   * ajoute uniquement la colonne purchases.photo_path (nullable)
--   * cree le bucket prive "purchase-photos" et ses politiques
-- Aucune donnee n'est supprimee ni reinitalisee.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Colonne de reference vers la photo (nullable = achat sans photo)
-- ---------------------------------------------------------------------
alter table public.purchases
  add column if not exists photo_path text;

comment on column public.purchases.photo_path is
  'Chemin de la photo dans le bucket Storage purchase-photos (ex : purchases/<id>/<uuid>.jpg)';

-- ---------------------------------------------------------------------
-- 2. Bucket prive dedie aux photos d'achats
--    - public = false : pas d'acces anonyme, URL signees uniquement
--    - taille max 5 Mo, types autorises JPG / PNG / WEBP
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'purchase-photos',
  'purchase-photos',
  false,
  5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public             = false,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- 3. Politiques Storage (table storage.objects)
--    Seul le compte partage peut lire, deposer, mettre a jour ou
--    supprimer les photos du bucket purchase-photos.
--    La verification est faite par la base, pas par le frontend.
-- ---------------------------------------------------------------------
drop policy if exists "purchase photos read shared account" on storage.objects;
create policy "purchase photos read shared account"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'purchase-photos'
    and (auth.jwt() ->> 'email') = 'admin-2026@gmail.com'
  );

drop policy if exists "purchase photos insert shared account" on storage.objects;
create policy "purchase photos insert shared account"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'purchase-photos'
    and (auth.jwt() ->> 'email') = 'admin-2026@gmail.com'
  );

drop policy if exists "purchase photos update shared account" on storage.objects;
create policy "purchase photos update shared account"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'purchase-photos'
    and (auth.jwt() ->> 'email') = 'admin-2026@gmail.com'
  )
  with check (
    bucket_id = 'purchase-photos'
    and (auth.jwt() ->> 'email') = 'admin-2026@gmail.com'
  );

drop policy if exists "purchase photos delete shared account" on storage.objects;
create policy "purchase photos delete shared account"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'purchase-photos'
    and (auth.jwt() ->> 'email') = 'admin-2026@gmail.com'
  );

-- ---------------------------------------------------------------------
-- Verification :
--   select id, name, public, file_size_limit, allowed_mime_types
--   from storage.buckets where id = 'purchase-photos';
--   select column_name from information_schema.columns
--   where table_name = 'purchases' and column_name = 'photo_path';
-- ---------------------------------------------------------------------
