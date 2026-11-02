-- Explicit administrative history purge. Never executed automatically.
-- Existing logs and all business records are preserved by this migration.
begin;

do $$
begin
  if to_regclass('public.audit_logs') is null then
    raise exception 'Apply 20260501000000_audit_logs.sql before the audit cleanup migration';
  end if;
end;
$$;

-- Freeze exact event IDs at confirmation time. A timestamp alone is not enough
-- when an event commits later with the same or an earlier transaction timestamp.
create table if not exists public.audit_history_clear_requests (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  cutoff timestamptz not null,
  event_ids uuid[] not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.audit_history_clear_requests enable row level security;
revoke all on public.audit_history_clear_requests from public, anon, authenticated;

-- Keep an immutable administrative receipt outside the deletable journal.
create table if not exists public.audit_history_purges (
  id uuid primary key,
  actor_id uuid not null,
  actor_email text not null,
  cutoff timestamptz not null,
  removed_count bigint not null check (removed_count >= 0),
  created_at timestamptz not null default clock_timestamp()
);
alter table public.audit_history_purges enable row level security;
revoke all on public.audit_history_purges from public, anon, authenticated;
grant select on public.audit_history_purges to authenticated;
drop policy if exists audit_purges_shared_account_read on public.audit_history_purges;
create policy audit_purges_shared_account_read on public.audit_history_purges
  for select to authenticated
  using ((select auth.uid()) is not null and (select auth.jwt()->>'email') = 'admin-2026@gmail.com');

-- No direct deletion or log forgery, even for the shared account.
revoke insert, update, delete, truncate on public.audit_logs from public, anon, authenticated;

create or replace function public.preview_audit_history_clear()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_cutoff timestamptz := clock_timestamp(); v_ids uuid[]; v_request_id uuid;
begin
  if auth.uid() is null or (auth.jwt()->>'email') is distinct from 'admin-2026@gmail.com' then
    raise exception 'AUDIT_CLEAR_FORBIDDEN' using errcode = '42501';
  end if;
  delete from public.audit_history_clear_requests where created_at < clock_timestamp() - interval '30 minutes';
  select coalesce(array_agg(id), '{}'::uuid[]) into v_ids from public.audit_logs where created_at <= v_cutoff;
  insert into public.audit_history_clear_requests(actor_id, cutoff, event_ids)
    values(auth.uid(), v_cutoff, v_ids) returning id into v_request_id;
  return jsonb_build_object('request_id', v_request_id, 'cutoff', v_cutoff, 'count', cardinality(v_ids));
end;
$$;

create or replace function public.clear_audit_history(p_request_id uuid, p_cutoff timestamptz, p_confirmation text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_previous public.audit_history_purges%rowtype; v_request public.audit_history_clear_requests%rowtype; v_count bigint;
begin
  if auth.uid() is null or (auth.jwt()->>'email') is distinct from 'admin-2026@gmail.com' then
    raise exception 'AUDIT_CLEAR_FORBIDDEN' using errcode = '42501';
  end if;
  if btrim(p_confirmation) is distinct from 'SUPPRIMER' then raise exception 'AUDIT_CLEAR_CONFIRMATION'; end if;
  if p_request_id is null or p_cutoff is null or not isfinite(p_cutoff) then raise exception 'AUDIT_CLEAR_INVALID_REQUEST'; end if;

  perform pg_advisory_xact_lock(hashtext('t9dya.audit_history.purge'));
  select * into v_previous from public.audit_history_purges where id = p_request_id;
  if found then
    if v_previous.cutoff is distinct from p_cutoff or v_previous.actor_id is distinct from auth.uid() then raise exception 'AUDIT_CLEAR_INVALID_REQUEST'; end if;
    return v_previous.removed_count;
  end if;
  select * into v_request from public.audit_history_clear_requests where id = p_request_id for update;
  if not found or v_request.actor_id is distinct from auth.uid() or v_request.cutoff is distinct from p_cutoff then
    raise exception 'AUDIT_CLEAR_INVALID_REQUEST';
  end if;
  if p_cutoff > clock_timestamp() or p_cutoff < clock_timestamp() - interval '30 minutes' then
    raise exception 'AUDIT_CLEAR_EXPIRED';
  end if;

  delete from public.audit_logs where id = any(v_request.event_ids) and created_at <= p_cutoff;
  get diagnostics v_count = row_count;
  insert into public.audit_history_purges(id, actor_id, actor_email, cutoff, removed_count)
    values(p_request_id, auth.uid(), auth.jwt()->>'email', p_cutoff, v_count);
  delete from public.audit_history_clear_requests where id = p_request_id;
  return v_count;
end;
$$;

revoke all on function public.preview_audit_history_clear() from public, anon, authenticated;
revoke all on function public.clear_audit_history(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.preview_audit_history_clear() to authenticated;
grant execute on function public.clear_audit_history(uuid, timestamptz, text) to authenticated;

do $$
declare v_table text;
begin
  foreach v_table in array array['audit_logs','audit_history_purges'] loop
    if exists(select 1 from pg_publication where pubname = 'supabase_realtime')
      and not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;