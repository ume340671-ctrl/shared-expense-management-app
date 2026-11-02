-- =====================================================================
-- T9DYA MANAGER — Schéma initial
-- PostgreSQL / Supabase
--
-- Tables : housemates (4 colocataires), purchases (achats partagés)
-- Montant total = unit_price × quantity (calculé par l'application)
-- Idempotent : peut être exécuté plusieurs fois sans créer de doublons.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Table housemates — les quatre colocataires prédéfinis
-- ---------------------------------------------------------------------
create table if not exists public.housemates (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null,
  created_at timestamptz not null default now(),
  constraint housemates_full_name_unique unique (full_name),
  constraint housemates_full_name_not_blank check (char_length(btrim(full_name)) > 0)
);

-- ---------------------------------------------------------------------
-- Table purchases — achats enregistrés par le groupe
-- ---------------------------------------------------------------------
create table if not exists public.purchases (
  id            uuid primary key default gen_random_uuid(),
  item_name     text not null,
  unit_price    numeric(12, 2) not null,
  quantity      integer not null default 1,
  buyer_id      uuid not null references public.housemates (id) on update cascade,
  purchase_date date not null default current_date,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Validations en base (la sécurité ne repose pas uniquement sur React)
  constraint purchases_item_name_not_blank check (char_length(btrim(item_name)) > 0),
  constraint purchases_unit_price_non_negative check (unit_price >= 0),
  constraint purchases_quantity_positive check (quantity >= 1),
  constraint purchases_date_not_in_future check (purchase_date <= current_date)
);

-- Index pertinents (filtres et tri)
create index if not exists purchases_buyer_id_idx       on public.purchases (buyer_id);
create index if not exists purchases_purchase_date_idx  on public.purchases (purchase_date desc);
create index if not exists purchases_created_at_idx     on public.purchases (created_at desc);
create index if not exists purchases_item_name_idx      on public.purchases (lower(item_name));

-- ---------------------------------------------------------------------
-- Mise à jour automatique de updated_at
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists purchases_set_updated_at on public.purchases;
create trigger purchases_set_updated_at
  before update on public.purchases
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Préchargement idempotent des quatre colocataires
-- (ON CONFLICT : aucun doublon même si le script est rejoué)
-- ---------------------------------------------------------------------
insert into public.housemates (full_name) values
  ('RACHID FERHAOUI'),
  ('ELHOUSSAINE OUMLAL'),
  ('TARIK MERRAS'),
  ('ABDESAMAD HAMI')
on conflict (full_name) do nothing;

-- ---------------------------------------------------------------------
-- Row Level Security
-- Seul le compte partagé admin-2026@gmail.com accède aux données.
-- La vérification est faite par la base de données, pas par React.
-- Si vous utilisez une autre adresse, adaptez la constante ci-dessous.
-- ---------------------------------------------------------------------
alter table public.housemates enable row level security;
alter table public.purchases   enable row level security;

-- Droits minimales pour le rôle authentifié
grant usage on schema public to authenticated;
grant select                         on public.housemates to authenticated;
grant select, insert, update, delete on public.purchases   to authenticated;

drop policy if exists "housemates_select_shared_account" on public.housemates;
create policy "housemates_select_shared_account"
  on public.housemates
  for select
  to authenticated
  using ((auth.jwt() ->> 'email') = 'admin-2026@gmail.com');

drop policy if exists "purchases_select_shared_account" on public.purchases;
create policy "purchases_select_shared_account"
  on public.purchases
  for select
  to authenticated
  using ((auth.jwt() ->> 'email') = 'admin-2026@gmail.com');

drop policy if exists "purchases_insert_shared_account" on public.purchases;
create policy "purchases_insert_shared_account"
  on public.purchases
  for insert
  to authenticated
  with check ((auth.jwt() ->> 'email') = 'admin-2026@gmail.com');

drop policy if exists "purchases_update_shared_account" on public.purchases;
create policy "purchases_update_shared_account"
  on public.purchases
  for update
  to authenticated
  using ((auth.jwt() ->> 'email') = 'admin-2026@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'admin-2026@gmail.com');

drop policy if exists "purchases_delete_shared_account" on public.purchases;
create policy "purchases_delete_shared_account"
  on public.purchases
  for delete
  to authenticated
  using ((auth.jwt() ->> 'email') = 'admin-2026@gmail.com');

-- ---------------------------------------------------------------------
-- Temps réel : diffusion des changements de la table purchases
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.purchases;
exception
  when duplicate_object then
    null; -- déjà ajoutée, on ignore
end;
$$;
