-- =====================================================================
-- T9DYA MANAGER — Journal d'audit (audit_logs)
--
-- Journalisation SERVEUR par triggers PostgreSQL :
--   * le frontend ne peut pas insérer, modifier ni supprimer d'événements
--   * l'auteur est lu depuis le JWT de la session (auth.uid / auth.jwt)
--     donc impossible à falsifier depuis le navigateur
--   * aucune donnée existante n'est supprimée
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Table du journal
-- ---------------------------------------------------------------------
create table if not exists public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid,                          -- auth.uid() de l'auteur
  actor_email  text,                          -- email lu dans le JWT (non falsifiable)
  action       text not null check (action in ('CREATE', 'UPDATE', 'DELETE', 'UPLOAD')),
  entity_type  text not null,                 -- 'purchase' | 'photo' | ...
  entity_id    uuid,                          -- élément concerné (achat)
  entity_label text,                          -- libellé lisible (nom de l'article…)
  old_values   jsonb,                         -- anciennes valeurs (modifications)
  new_values   jsonb,                         -- nouvelles valeurs
  summary      text not null,                 -- résumé lisible de l'opération
  created_at   timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_action_idx     on public.audit_logs (action);
create index if not exists audit_logs_actor_idx      on public.audit_logs (actor_email);
create index if not exists audit_logs_entity_idx     on public.audit_logs (entity_type, entity_id);

-- ---------------------------------------------------------------------
-- 2. Sécurité : LECTURE SEULE pour le compte partagé
--    Aucun droit d'écriture pour « authenticated » : les événements ne
--    peuvent être créés que par les triggers (SECURITY DEFINER).
-- ---------------------------------------------------------------------
alter table public.audit_logs enable row level security;

grant select on public.audit_logs to authenticated;

drop policy if exists "audit_logs_select_shared_account" on public.audit_logs;
create policy "audit_logs_select_shared_account"
  on public.audit_logs
  for select
  to authenticated
  using ((auth.jwt() ->> 'email') = 'admin-2026@gmail.com');

-- ---------------------------------------------------------------------
-- 3. Trigger : achats (INSERT / UPDATE / DELETE)
--    - valeur métier uniquement dans old_values / new_values
--    - aucune donnée sensible (mot de passe, jeton, clé) n'existe dans
--      la table purchases : rien de sensible n'est journalisé
-- ---------------------------------------------------------------------
create or replace function public.log_purchase_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id    uuid := auth.uid();
  v_actor_email text := auth.jwt() ->> 'email';
  v_actor       text := coalesce(auth.jwt() ->> 'email', 'un utilisateur');
  v_item        text;
  v_summary     text;
  v_changes     text[] := array[]::text[];
  v_old_buyer   text;
  v_new_buyer   text;
begin
  if (tg_op = 'INSERT') then
    v_item := new.item_name;
    v_summary := format(
      '%s a ajouté l''achat « %s » (%s DH × %s)',
      v_actor, new.item_name, round(new.unit_price, 2), new.quantity
    );

    insert into public.audit_logs
      (actor_id, actor_email, action, entity_type, entity_id, entity_label, old_values, new_values, summary)
    values
      (v_actor_id, v_actor_email, 'CREATE', 'purchase', new.id, new.item_name, null, to_jsonb(new), v_summary);

  elsif (tg_op = 'UPDATE') then
    v_item := new.item_name;

    if new.item_name <> old.item_name then
      v_changes := array_append(v_changes, format('nom : « %s » → « %s »', old.item_name, new.item_name));
    end if;
    if new.unit_price <> old.unit_price then
      v_changes := array_append(v_changes, format('prix unitaire : %s DH → %s DH', round(old.unit_price, 2), round(new.unit_price, 2)));
    end if;
    if new.quantity <> old.quantity then
      v_changes := array_append(v_changes, format('quantité : %s → %s', old.quantity, new.quantity));
    end if;
    if new.purchase_date <> old.purchase_date then
      v_changes := array_append(v_changes, format('date : %s → %s', to_char(old.purchase_date, 'DD/MM/YYYY'), to_char(new.purchase_date, 'DD/MM/YYYY')));
    end if;
    if new.buyer_id <> old.buyer_id then
      select full_name into v_old_buyer from public.housemates where id = old.buyer_id;
      select full_name into v_new_buyer from public.housemates where id = new.buyer_id;
      v_changes := array_append(v_changes, format('acheteur : %s → %s', coalesce(v_old_buyer, '?'), coalesce(v_new_buyer, '?')));
    end if;
    if coalesce(new.notes, '') <> coalesce(old.notes, '') then
      v_changes := array_append(v_changes, 'remarque modifiée');
    end if;
    if new.photo_path is distinct from old.photo_path then
      if new.photo_path is null then
        v_changes := array_append(v_changes, 'photo retirée');
      elsif old.photo_path is null then
        v_changes := array_append(v_changes, 'photo ajoutée');
      else
        v_changes := array_append(v_changes, 'photo remplacée');
      end if;
    end if;

    -- Aucun changement métier : on ne journalise pas
    if array_length(v_changes, 1) is not null then
      v_summary := format('%s a modifié l''achat « %s » : %s', v_actor, new.item_name, array_to_string(v_changes, ' · '));

      insert into public.audit_logs
        (actor_id, actor_email, action, entity_type, entity_id, entity_label, old_values, new_values, summary)
      values
        (v_actor_id, v_actor_email, 'UPDATE', 'purchase', new.id, new.item_name, to_jsonb(old), to_jsonb(new), v_summary);
    end if;

  elsif (tg_op = 'DELETE') then
    v_item := old.item_name;
    v_summary := format(
      '%s a supprimé l''achat « %s » (%s DH)',
      v_actor, old.item_name, round(old.unit_price * old.quantity, 2)
    );

    insert into public.audit_logs
      (actor_id, actor_email, action, entity_type, entity_id, entity_label, old_values, new_values, summary)
    values
      (v_actor_id, v_actor_email, 'DELETE', 'purchase', old.id, old.item_name, to_jsonb(old), null, v_summary);
  end if;

  return null;
end;
$$;

drop trigger if exists purchases_audit_insert on public.purchases;
create trigger purchases_audit_insert
  after insert on public.purchases
  for each row execute function public.log_purchase_audit();

drop trigger if exists purchases_audit_update on public.purchases;
create trigger purchases_audit_update
  after update on public.purchases
  for each row execute function public.log_purchase_audit();

drop trigger if exists purchases_audit_delete on public.purchases;
create trigger purchases_audit_delete
  after delete on public.purchases
  for each row execute function public.log_purchase_audit();

-- ---------------------------------------------------------------------
-- 4. Trigger : photos (Supabase Storage, bucket purchase-photos)
--    Journalise le dépôt (UPLOAD) et la suppression (DELETE) des fichiers.
--    Les événements restent attachés à l'achat via entity_id.
-- ---------------------------------------------------------------------
create or replace function public.log_storage_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id    uuid := auth.uid();
  v_actor_email text := auth.jwt() ->> 'email';
  v_actor       text := coalesce(auth.jwt() ->> 'email', 'un utilisateur');
  v_bucket      text;
  v_path        text;
  v_purchase_id uuid := null;
  v_label       text;
begin
  if (tg_op = 'DELETE') then
    v_bucket := old.bucket_id;
    v_path   := old.name;
  else
    v_bucket := new.bucket_id;
    v_path   := new.name;
  end if;

  -- Uniquement le bucket des photos d'achats
  if v_bucket <> 'purchase-photos' then
    return null;
  end if;

  -- Chemin attendu : purchases/<uuid-achat>/<fichier>
  begin
    v_purchase_id := nullif(split_part(v_path, '/', 2), '')::uuid;
  exception when others then
    v_purchase_id := null;
  end;

  if v_purchase_id is not null then
    select item_name into v_label from public.purchases where id = v_purchase_id;
  end if;
  if v_label is null then
    v_label := v_path;
  end if;

  if (tg_op = 'DELETE') then
    insert into public.audit_logs
      (actor_id, actor_email, action, entity_type, entity_id, entity_label, old_values, new_values, summary)
    values
      (v_actor_id, v_actor_email, 'DELETE', 'photo', v_purchase_id, v_label,
       jsonb_build_object('path', v_path), null,
       format('%s a supprimé la photo de l''achat « %s »', v_actor, v_label));
  else
    insert into public.audit_logs
      (actor_id, actor_email, action, entity_type, entity_id, entity_label, old_values, new_values, summary)
    values
      (v_actor_id, v_actor_email, 'UPLOAD', 'photo', v_purchase_id, v_label,
       null, jsonb_build_object('path', v_path),
       format('%s a ajouté une photo à l''achat « %s »', v_actor, v_label));
  end if;

  return null;
end;
$$;

drop trigger if exists purchase_photos_audit on storage.objects;
create trigger purchase_photos_audit
  after insert or delete on storage.objects
  for each row execute function public.log_storage_audit();

-- ---------------------------------------------------------------------
-- Vérification :
--   select action, entity_type, count(*) from public.audit_logs group by 1, 2;
--   select summary, created_at from public.audit_logs order by created_at desc limit 10;
-- ---------------------------------------------------------------------
