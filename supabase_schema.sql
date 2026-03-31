-- BiletPro Multi-Device Online Schema (v1)
-- Supabase SQL Editor'de çalıştırın.

create extension if not exists pgcrypto;

create table if not exists users_app (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  full_name text not null,
  role text not null default 'staff',
  is_active boolean not null default true,
  perms jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  legacy_event_id text unique,
  title text not null,
  company text,
  venue text,
  city text,
  full_address text,
  event_date date,
  door_time text,
  start_time text,
  is_active boolean not null default true,
  payload_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists events add column if not exists payload_json jsonb;

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  ticket_hash text not null unique,
  category_name text,
  table_no text,
  customer_name text,
  customer_phone text,
  sold_by_username text,
  people_count int not null default 1,
  inside_count int not null default 0,
  paid numeric(12,2) not null default 0,
  debt numeric(12,2) not null default 0,
  status text not null default 'READY',
  checkin_time timestamptz,
  last_out_time timestamptz,
  payload_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists tickets add column if not exists payload_json jsonb;

create index if not exists idx_tickets_event_id on tickets(event_id);
create index if not exists idx_tickets_customer_phone on tickets(customer_phone);
create index if not exists idx_tickets_status on tickets(status);

create table if not exists checkins (
  id bigint generated always as identity primary key,
  event_id uuid not null references events(id) on delete cascade,
  ticket_id uuid not null references tickets(id) on delete cascade,
  ticket_hash text not null,
  gate_id text not null default 'main',
  action text not null, -- IN / OUT / REIN / DEBT_SKIP / DEBT_PAY
  people_delta int not null default 1,
  paid_delta numeric(12,2) not null default 0,
  debt_after numeric(12,2),
  actor_username text,
  created_at timestamptz not null default now()
);

create index if not exists idx_checkins_event_id on checkins(event_id);
create index if not exists idx_checkins_ticket_hash on checkins(ticket_hash);

create table if not exists audit_logs (
  id bigint generated always as identity primary key,
  module text not null,
  action text not null,
  details text,
  actor_name text,
  actor_username text,
  actor_role text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created_at on audit_logs(created_at desc);

-- Atomik check-in fonksiyonu (aynı bileti aynı anda 2 kapı okutamaz)
create or replace function ticket_checkin_atomic(
  p_ticket_hash text,
  p_gate_user text,
  p_gate_id text default 'main'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket tickets%rowtype;
begin
  select * into v_ticket
  from tickets
  where ticket_hash = p_ticket_hash
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_ticket.status = 'INSIDE' then
    return jsonb_build_object('ok', false, 'reason', 'already_inside');
  end if;

  if coalesce(v_ticket.debt, 0) > 0 then
    return jsonb_build_object('ok', false, 'reason', 'debt_pending', 'debt', v_ticket.debt);
  end if;

  update tickets
  set status = 'INSIDE',
      inside_count = greatest(inside_count, 0) + 1,
      checkin_time = now(),
      updated_at = now()
  where id = v_ticket.id;

  insert into checkins(event_id, ticket_id, ticket_hash, gate_id, action, people_delta, actor_username)
  values(v_ticket.event_id, v_ticket.id, v_ticket.ticket_hash, p_gate_id, 'IN', 1, p_gate_user);

  return jsonb_build_object('ok', true, 'reason', 'checked_in');
end;
$$;

-- Genel kapı aksiyonu (IN/OUT/REIN/DEBT_PAY/DEBT_SKIP) atomik çalışır
create or replace function ticket_gate_action_atomic(
  p_ticket_hash text,
  p_action text,
  p_gate_user text,
  p_gate_id text default 'main',
  p_people_delta int default 0,
  p_paid_delta numeric default 0,
  p_debt_after numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket tickets%rowtype;
  v_new_inside int;
  v_new_debt numeric;
begin
  select * into v_ticket
  from tickets
  where ticket_hash = p_ticket_hash
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if p_action = 'IN' then
    if v_ticket.status = 'INSIDE' then
      return jsonb_build_object('ok', false, 'reason', 'already_inside');
    end if;
    if coalesce(v_ticket.debt, 0) > 0 then
      return jsonb_build_object('ok', false, 'reason', 'debt_pending', 'debt', v_ticket.debt);
    end if;

    v_new_inside := greatest(coalesce(v_ticket.inside_count, 0), 0) + greatest(coalesce(p_people_delta, 1), 1);

    update tickets
    set status = 'INSIDE',
        inside_count = v_new_inside,
        checkin_time = now(),
        updated_at = now()
    where id = v_ticket.id;

    insert into checkins(event_id, ticket_id, ticket_hash, gate_id, action, people_delta, actor_username)
    values(v_ticket.event_id, v_ticket.id, v_ticket.ticket_hash, p_gate_id, 'IN', greatest(coalesce(p_people_delta, 1), 1), p_gate_user);

    return jsonb_build_object('ok', true, 'reason', 'checked_in');
  end if;

  if p_action = 'DEBT_PAY' then
    v_new_inside := greatest(coalesce(v_ticket.inside_count, 0), 0) + greatest(coalesce(p_people_delta, 1), 1);
    v_new_debt := coalesce(p_debt_after, greatest(coalesce(v_ticket.debt, 0) - coalesce(p_paid_delta, 0), 0));

    update tickets
    set status = 'INSIDE',
        inside_count = v_new_inside,
        paid = coalesce(v_ticket.paid, 0) + greatest(coalesce(p_paid_delta, 0), 0),
        debt = v_new_debt,
        checkin_time = now(),
        updated_at = now()
    where id = v_ticket.id;

    insert into checkins(event_id, ticket_id, ticket_hash, gate_id, action, people_delta, paid_delta, debt_after, actor_username)
    values(v_ticket.event_id, v_ticket.id, v_ticket.ticket_hash, p_gate_id, 'DEBT_PAY', greatest(coalesce(p_people_delta, 1), 1), greatest(coalesce(p_paid_delta, 0), 0), v_new_debt, p_gate_user);

    return jsonb_build_object('ok', true, 'reason', 'debt_paid_and_checked_in', 'debt_after', v_new_debt);
  end if;

  if p_action = 'DEBT_SKIP' then
    update tickets
    set status = 'INSIDE',
        updated_at = now()
    where id = v_ticket.id;

    insert into checkins(event_id, ticket_id, ticket_hash, gate_id, action, people_delta, debt_after, actor_username)
    values(v_ticket.event_id, v_ticket.id, v_ticket.ticket_hash, p_gate_id, 'DEBT_SKIP', 0, coalesce(v_ticket.debt, 0), p_gate_user);

    return jsonb_build_object('ok', true, 'reason', 'debt_skipped');
  end if;

  if p_action = 'OUT' then
    update tickets
    set status = 'OUTSIDE',
        last_out_time = now(),
        updated_at = now()
    where id = v_ticket.id;

    insert into checkins(event_id, ticket_id, ticket_hash, gate_id, action, people_delta, actor_username)
    values(v_ticket.event_id, v_ticket.id, v_ticket.ticket_hash, p_gate_id, 'OUT', 0, p_gate_user);

    return jsonb_build_object('ok', true, 'reason', 'set_outside');
  end if;

  if p_action = 'REIN' then
    update tickets
    set status = 'INSIDE',
        updated_at = now()
    where id = v_ticket.id;

    insert into checkins(event_id, ticket_id, ticket_hash, gate_id, action, people_delta, actor_username)
    values(v_ticket.event_id, v_ticket.id, v_ticket.ticket_hash, p_gate_id, 'REIN', 0, p_gate_user);

    return jsonb_build_object('ok', true, 'reason', 'set_inside_again');
  end if;

  return jsonb_build_object('ok', false, 'reason', 'unknown_action');
end;
$$;

-- Aynı etkinlikte aynı masa ikinci kez satılamaz (DB-level kilit)
create unique index if not exists uq_tickets_event_table_no
  on tickets(event_id, table_no)
  where table_no is not null and table_no <> '';

-- ─── PERFORMANS İNDEXLERİ (kapı hız optimizasyonu) ───
-- ticket_hash unique constraint zaten index oluşturuyor;
-- ek olarak gate action sorgularını hızlandırmak için composite index:
create index if not exists idx_tickets_hash_status
  on tickets(ticket_hash, status);

-- İçerideki kişi sayısı sorgusunu hızlandır
create index if not exists idx_tickets_event_status
  on tickets(event_id, status);

-- RPC fonksiyonlarını anonim/authenticated rollerinden çağrılabilir yap
grant execute on function ticket_gate_action_atomic(text,text,text,text,int,numeric,numeric) to anon, authenticated;
grant execute on function ticket_checkin_atomic(text,text,text) to anon, authenticated;

-- Atomik satış fonksiyonu (aynı anda 2 kasa aynı masayı satamaz)
-- p_tickets örneği:
-- [
--   {
--     "ticket_hash": "EV123-M2-T998877",
--     "category_name": "VIP",
--     "table_no": "2",
--     "customer_name": "Ali Veli",
--     "customer_phone": "90555...",
--     "sold_by_username": "Hakan",
--     "people_count": 4,
--     "inside_count": 0,
--     "paid": 28000,
--     "debt": 0,
--     "status": "READY",
--     "payload_json": {"masa": {...}, "saleDetail": {...}}
--   }
-- ]
create or replace function ticket_sale_atomic(
  p_legacy_event_id text,
  p_tickets jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_event_id uuid;
  v_conflicts jsonb;
  v_inserted_count int := 0;
begin
  if p_legacy_event_id is null or btrim(p_legacy_event_id) = '' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_event_id');
  end if;

  if p_tickets is null or jsonb_typeof(p_tickets) <> 'array' or jsonb_array_length(p_tickets) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_ticket_payload');
  end if;

  -- Event satırını kilitle: aynı event için satış akışı serialize edilir.
  select id into v_event_id
  from events
  where legacy_event_id = p_legacy_event_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'event_not_found');
  end if;

  -- Ön kontrol: bu masalardan satılmış olan var mı?
  with req as (
    select nullif(btrim(x->>'table_no'), '') as table_no
    from jsonb_array_elements(p_tickets) as x
  )
  select coalesce(jsonb_object_agg(t.table_no, coalesce(t.customer_name, 'Bilinmiyor')), '{}'::jsonb)
  into v_conflicts
  from tickets t
  join req r on r.table_no is not null and t.table_no = r.table_no
  where t.event_id = v_event_id;

  if v_conflicts <> '{}'::jsonb then
    return jsonb_build_object('ok', false, 'reason', 'already_sold', 'soldTo', v_conflicts);
  end if;

  -- Atomik insert: unique(event_id, table_no) ikinci satışı DB seviyesinde engeller.
  insert into tickets(
    event_id,
    ticket_hash,
    category_name,
    table_no,
    customer_name,
    customer_phone,
    sold_by_username,
    people_count,
    inside_count,
    paid,
    debt,
    status,
    payload_json,
    created_at,
    updated_at
  )
  select
    v_event_id,
    x->>'ticket_hash',
    nullif(x->>'category_name', ''),
    nullif(btrim(x->>'table_no'), ''),
    nullif(x->>'customer_name', ''),
    nullif(x->>'customer_phone', ''),
    nullif(x->>'sold_by_username', ''),
    coalesce((x->>'people_count')::int, 1),
    coalesce((x->>'inside_count')::int, 0),
    coalesce((x->>'paid')::numeric, 0),
    coalesce((x->>'debt')::numeric, 0),
    coalesce(nullif(x->>'status', ''), 'READY'),
    coalesce(x->'payload_json', '{}'::jsonb),
    now(),
    now()
  from jsonb_array_elements(p_tickets) as x;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  return jsonb_build_object('ok', true, 'reason', 'sale_committed', 'inserted', v_inserted_count);

exception
  when unique_violation then
    -- Yarışta diğer kasa öne geçtiyse burada yakalanır.
    with req as (
      select nullif(btrim(x->>'table_no'), '') as table_no
      from jsonb_array_elements(p_tickets) as x
    )
    select coalesce(jsonb_object_agg(t.table_no, coalesce(t.customer_name, 'Bilinmiyor')), '{}'::jsonb)
    into v_conflicts
    from tickets t
    join req r on r.table_no is not null and t.table_no = r.table_no
    where t.event_id = v_event_id;

    return jsonb_build_object('ok', false, 'reason', 'already_sold', 'soldTo', coalesce(v_conflicts, '{}'::jsonb));

  when others then
    return jsonb_build_object('ok', false, 'reason', 'rpc_error', 'message', SQLERRM);
end;
$$;
