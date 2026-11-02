-- Independent friends ledger. No write to housemates, purchases or Storage.
-- Requires the previous audit migration. Execute the whole file in one run.
begin;

do $$
begin
  if to_regclass('public.audit_logs') is null then
    raise exception 'Apply 20260501000000_audit_logs.sql before the friends migration';
  end if;
end;
$$;

create schema if not exists t9dya_private;
revoke all on schema t9dya_private from public, anon, authenticated;

create table if not exists public.friend_members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(btrim(full_name)) between 1 and 80),
  created_at timestamptz not null default now()
);
create unique index if not exists friend_members_name on public.friend_members (lower(btrim(full_name)));

create table if not exists public.friend_periods (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique check (number > 0),
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  created_by uuid,
  closed_by uuid,
  check (closed_at is null or closed_at >= started_at)
);
create unique index if not exists friend_periods_one_open on public.friend_periods ((true)) where closed_at is null;

create table if not exists public.friend_expenses (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.friend_periods(id) on delete restrict,
  description text not null check (length(btrim(description)) between 1 and 200),
  amount_cents bigint not null check (amount_cents between 1 and 100000000),
  payer_id uuid not null references public.friend_members(id) on delete restrict,
  participant_ids uuid[] not null check (cardinality(participant_ids) between 1 and 50),
  incurred_on date not null check (incurred_on between date '1900-01-01' and current_date),
  notes text check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);
create index if not exists friend_expenses_period on public.friend_expenses(period_id, incurred_on desc, created_at desc);

create table if not exists public.friend_settlements (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.friend_periods(id) on delete restrict,
  from_member_id uuid not null references public.friend_members(id) on delete restrict,
  to_member_id uuid not null references public.friend_members(id) on delete restrict,
  amount_cents bigint not null check (amount_cents between 1 and 100000000),
  paid_on date not null check (paid_on between date '1900-01-01' and current_date),
  notes text check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  created_by uuid,
  check (from_member_id <> to_member_id)
);
create index if not exists friend_settlements_period on public.friend_settlements(period_id, paid_on desc, created_at desc);

-- An empty accounting period, not a demonstration expense. Idempotent seed.
insert into public.friend_periods(number) values (1) on conflict (number) do nothing;

do $$
declare table_name text;
begin
  foreach table_name in array array['friend_members','friend_periods','friend_expenses','friend_settlements'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('drop policy if exists friends_read_shared_account on public.%I', table_name);
    execute format('create policy friends_read_shared_account on public.%I for select to authenticated using ((select auth.uid()) is not null and (select auth.jwt() ->> ''email'') = ''admin-2026@gmail.com'')', table_name);
  end loop;
end;
$$;

create or replace function t9dya_private.friends_check_account()
returns void language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null or (auth.jwt() ->> 'email') is distinct from 'admin-2026@gmail.com' then
    raise exception 'FRIENDS_FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;

-- Sort UUIDs to allocate remainder cents consistently, irrespective of UI order.
create or replace function t9dya_private.friend_shares(p_amount bigint, p_ids uuid[])
returns table(member_id uuid, share_cents bigint)
language sql immutable set search_path = '' as $$
  select id, p_amount / cardinality(p_ids)
    + case when row_number() over(order by id) <= p_amount % cardinality(p_ids) then 1 else 0 end
  from unnest(p_ids) id;
$$;

create or replace function t9dya_private.friend_balances(p_period uuid)
returns table(member_id uuid, balance_cents bigint, paid_cents bigint)
language sql stable set search_path = '' as $$
  with movements as (
    select payer_id as member_id, amount_cents as amount from public.friend_expenses where period_id = p_period
    union all
    select s.member_id, -s.share_cents from public.friend_expenses e
      cross join lateral t9dya_private.friend_shares(e.amount_cents, e.participant_ids) s where e.period_id = p_period
    union all
    select from_member_id, amount_cents from public.friend_settlements where period_id = p_period
    union all
    select to_member_id, -amount_cents from public.friend_settlements where period_id = p_period
  )
  select m.id, coalesce((select sum(v.amount) from movements v where v.member_id = m.id), 0)::bigint,
    coalesce((select sum(e.amount_cents) from public.friend_expenses e where e.period_id = p_period and e.payer_id = m.id), 0)::bigint
  from public.friend_members m;
$$;

create or replace function public.friends_snapshot(p_period_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_period_id uuid; v_periods jsonb; v_period jsonb;
begin
  perform t9dya_private.friends_check_account();
  select id into v_period_id from public.friend_periods
    where (p_period_id is null and closed_at is null) or id = p_period_id;
  if v_period_id is null then raise exception 'FRIENDS_PERIOD_NOT_FOUND'; end if;
  select jsonb_agg(to_jsonb(p) || jsonb_build_object(
    'expense_count', (select count(*) from public.friend_expenses e where e.period_id = p.id),
    'settlement_count', (select count(*) from public.friend_settlements s where s.period_id = p.id),
    'total_cents', coalesce((select sum(amount_cents) from public.friend_expenses e where e.period_id = p.id),0),
    'repaid_cents', coalesce((select sum(amount_cents) from public.friend_settlements s where s.period_id = p.id),0)
  ) order by p.number desc) into v_periods from public.friend_periods p;
  select value into v_period from jsonb_array_elements(v_periods) where value->>'id' = v_period_id::text;
  return jsonb_build_object(
    'members', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at, m.id) from public.friend_members m), '[]'::jsonb),
    'periods', v_periods, 'period', v_period,
    'expenses', coalesce((select jsonb_agg(to_jsonb(e) order by e.incurred_on desc, e.created_at desc, e.id) from public.friend_expenses e where e.period_id = v_period_id), '[]'::jsonb),
    'settlements', coalesce((select jsonb_agg(to_jsonb(s) order by s.paid_on desc, s.created_at desc, s.id) from public.friend_settlements s where s.period_id = v_period_id), '[]'::jsonb),
    'balances', coalesce((select jsonb_agg(to_jsonb(b)) from t9dya_private.friend_balances(v_period_id) b), '[]'::jsonb)
  );
end;
$$;

-- All writes take the SAME period row lock: reset cannot race with expenses
-- or repayments, including writes coming from another authenticated device.
create or replace function public.friends_mutate(p_period_id uuid, p_action text, p_data jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_period public.friend_periods%rowtype;
  v_expense public.friend_expenses%rowtype;
  v_settlement public.friend_settlements%rowtype;
  v_id uuid; v_amount bigint; v_numeric numeric; v_date date;
  v_payer uuid; v_from uuid; v_to uuid; v_ids uuid[];
  v_name text; v_notes text; v_from_balance bigint; v_to_balance bigint;
begin
  perform t9dya_private.friends_check_account();
  select * into v_period from public.friend_periods where id = p_period_id for update;
  if not found then raise exception 'FRIENDS_PERIOD_NOT_FOUND'; end if;
  if v_period.closed_at is not null then raise exception 'FRIENDS_PERIOD_CLOSED'; end if;

  if p_action = 'period.reset' then
    if exists(select 1 from t9dya_private.friend_balances(p_period_id) where balance_cents <> 0) then
      raise exception 'FRIENDS_OUTSTANDING_DEBT';
    end if;
    if not exists(select 1 from public.friend_expenses where period_id = p_period_id)
      and not exists(select 1 from public.friend_settlements where period_id = p_period_id) then
      raise exception 'FRIENDS_EMPTY_PERIOD';
    end if;
    update public.friend_periods set closed_at = clock_timestamp(), closed_by = auth.uid() where id = p_period_id;
    insert into public.friend_periods(number, started_at, created_by) values (v_period.number + 1, clock_timestamp(), auth.uid()) returning id into v_id;
    return v_id;
  end if;

  v_id := (p_data->>'id')::uuid;
  if v_id is null then raise exception 'FRIENDS_STALE_RECORD'; end if;
  if p_action = 'member.add' then
    v_name := btrim(p_data->>'full_name');
    if v_name is null or length(v_name) not between 1 and 80 then raise exception 'FRIENDS_INVALID_NAME'; end if;
    if exists(select 1 from public.friend_members where id = v_id and full_name = v_name) then return v_id; end if;
    insert into public.friend_members(id, full_name) values(v_id, v_name);
    return v_id;
  end if;

  if p_action = 'expense.save' or p_action = 'settlement.add' then
    v_numeric := (p_data->>'amount_cents')::numeric;
    if v_numeric is null or v_numeric < 1 or v_numeric > 100000000 or v_numeric <> trunc(v_numeric) then
      raise exception 'FRIENDS_INVALID_AMOUNT';
    end if;
    v_amount := v_numeric::bigint;
    v_notes := nullif(btrim(p_data->>'notes'), '');
    if length(v_notes) > 1000 then raise exception 'FRIENDS_INVALID_NOTES'; end if;
    begin
      v_date := (case when p_action = 'expense.save' then p_data->>'incurred_on' else p_data->>'paid_on' end)::date;
    exception when others then raise exception 'FRIENDS_INVALID_DATE'; end;
    if v_date is null or v_date < date '1900-01-01' or v_date > current_date then raise exception 'FRIENDS_INVALID_DATE'; end if;
  end if;

  if p_action = 'expense.save' then
    v_name := btrim(p_data->>'description');
    if v_name is null or length(v_name) not between 1 and 200 then raise exception 'FRIENDS_INVALID_DESCRIPTION'; end if;
    v_payer := (p_data->>'payer_id')::uuid;
    if jsonb_typeof(p_data->'participant_ids') is distinct from 'array' then raise exception 'FRIENDS_INVALID_PARTICIPANTS'; end if;
    select array_agg(value::uuid order by value::uuid) into v_ids from jsonb_array_elements_text(p_data->'participant_ids');
    if v_ids is null or cardinality(v_ids) not between 1 and 50
      or (select count(distinct id) from unnest(v_ids) id) <> cardinality(v_ids)
      or exists(select 1 from unnest(v_ids) candidate(member_id) where candidate.member_id is null
        or not exists(select 1 from public.friend_members m where m.id = candidate.member_id))
      or not exists(select 1 from public.friend_members where id = v_payer) then
      raise exception 'FRIENDS_INVALID_PARTICIPANTS';
    end if;
    select * into v_expense from public.friend_expenses where id = v_id;
    if found then
      if v_expense.period_id <> p_period_id then raise exception 'FRIENDS_STALE_RECORD'; end if;
      -- Stable client-generated IDs make network retries idempotent.
      if (v_expense.description, v_expense.amount_cents, v_expense.payer_id, v_expense.participant_ids, v_expense.incurred_on, v_expense.notes)
        is not distinct from (v_name, v_amount, v_payer, v_ids, v_date, v_notes) then return v_id; end if;
      if (p_data->>'expected_updated_at')::timestamptz is distinct from v_expense.updated_at then raise exception 'FRIENDS_STALE_RECORD'; end if;
      update public.friend_expenses set description = v_name, amount_cents = v_amount, payer_id = v_payer,
        participant_ids = v_ids, incurred_on = v_date, notes = v_notes, updated_at = clock_timestamp() where id = v_id;
    else
      if p_data->>'expected_updated_at' is not null then raise exception 'FRIENDS_STALE_RECORD'; end if;
      insert into public.friend_expenses(id, period_id, description, amount_cents, payer_id, participant_ids, incurred_on, notes, created_by)
        values(v_id, p_period_id, v_name, v_amount, v_payer, v_ids, v_date, v_notes, auth.uid());
    end if;
    return v_id;
  elsif p_action = 'expense.delete' then
    select * into v_expense from public.friend_expenses where id = v_id;
    if not found then return v_id; end if;
    if v_expense.period_id <> p_period_id or (p_data->>'expected_updated_at')::timestamptz is distinct from v_expense.updated_at then
      raise exception 'FRIENDS_STALE_RECORD';
    end if;
    delete from public.friend_expenses where id = v_id;
    return v_id;
  elsif p_action = 'settlement.add' then
    v_from := (p_data->>'from_member_id')::uuid;
    v_to := (p_data->>'to_member_id')::uuid;
    select * into v_settlement from public.friend_settlements where id = v_id;
    if found then
      if (v_settlement.period_id, v_settlement.from_member_id, v_settlement.to_member_id, v_settlement.amount_cents, v_settlement.paid_on, v_settlement.notes)
        is not distinct from (p_period_id, v_from, v_to, v_amount, v_date, v_notes) then return v_id; end if;
      raise exception 'FRIENDS_STALE_RECORD';
    end if;
    select balance_cents into v_from_balance from t9dya_private.friend_balances(p_period_id) where member_id = v_from;
    select balance_cents into v_to_balance from t9dya_private.friend_balances(p_period_id) where member_id = v_to;
    if v_from is null or v_to is null or v_from = v_to or v_from_balance is null or v_to_balance is null
      or v_from_balance >= 0 or v_to_balance <= 0 or v_amount > -v_from_balance or v_amount > v_to_balance then
      raise exception 'FRIENDS_INVALID_SETTLEMENT';
    end if;
    insert into public.friend_settlements(id, period_id, from_member_id, to_member_id, amount_cents, paid_on, notes, created_by)
      values(v_id, p_period_id, v_from, v_to, v_amount, v_date, v_notes, auth.uid());
    return v_id;
  elsif p_action = 'settlement.delete' then
    select * into v_settlement from public.friend_settlements where id = v_id;
    if not found then return v_id; end if;
    if v_settlement.period_id <> p_period_id then raise exception 'FRIENDS_STALE_RECORD'; end if;
    delete from public.friend_settlements where id = v_id;
    return v_id;
  end if;
  raise exception 'FRIENDS_UNKNOWN_ACTION';
end;
$$;

-- Server-generated identity and snapshots, integrated into the existing audit.
create or replace function t9dya_private.log_friend_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_old jsonb; v_new jsonb; v_row jsonb; v_label text; v_action text; v_kind text; v_verb text;
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then return null; end if;
  v_row := coalesce(v_new, v_old);
  v_kind := case tg_table_name when 'friend_expenses' then 'friend_expense' when 'friend_settlements' then 'friend_settlement'
    when 'friend_periods' then 'friend_period' else 'friend_member' end;
  v_label := coalesce(v_row->>'description', v_row->>'full_name',
    case when v_kind = 'friend_period' then 'Periode ' || (v_row->>'number') else 'Remboursement entre amis' end);
  v_action := case tg_op when 'INSERT' then 'CREATE' when 'DELETE' then 'DELETE' else 'UPDATE' end;
  v_verb := case tg_op when 'INSERT' then 'ajout' when 'DELETE' then 'suppression' else 'modification' end;
  insert into public.audit_logs(actor_id, actor_email, action, entity_type, entity_id, entity_label, old_values, new_values, summary)
    values(auth.uid(), auth.jwt()->>'email', v_action, v_kind, (v_row->>'id')::uuid, v_label, v_old, v_new,
      format('%s : %s - %s (entre amis)', coalesce(auth.jwt()->>'email','Systeme'), v_verb, v_label));
  return null;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['friend_members','friend_periods','friend_expenses','friend_settlements'] loop
    execute format('drop trigger if exists friends_audit on public.%I', table_name);
    execute format('create trigger friends_audit after insert or update or delete on public.%I for each row execute function t9dya_private.log_friend_change()', table_name);
    if exists(select 1 from pg_publication where pubname = 'supabase_realtime')
      and not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;

revoke all on all functions in schema t9dya_private from public, anon, authenticated;
revoke all on function public.friends_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.friends_mutate(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.friends_snapshot(uuid) to authenticated;
grant execute on function public.friends_mutate(uuid, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;