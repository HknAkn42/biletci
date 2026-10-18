-- BiletPro: kapı / satış sağlamlaştırma (tekrar çalıştırmak zararsızdır)
-- 1) Bayat bir cihaz sunucudaki kapı durumunu (içeride / dışarıda / kişi sayısı / ödenen / borç) geri alamaz.
-- 2) Kapı işlemleri (IN, MORE, DEBT_PAY, DEBT_SKIP, OUT, REIN) durum kontrollüdür; aynı işlem iki kez uygulanmaz.
-- 3) Pasif (durdurulmuş) etkinlikte satış ve kapı girişi sunucuda da reddedilir.

-- ─── 1) Kapı durumu koruması ───
create or replace function public.protect_ticket_gate_state()
returns trigger
language plpgsql
as $$
begin
  -- Kapı fonksiyonları bu işareti koyar; onlar serbestçe değiştirebilir
  if coalesce(current_setting('bp.gate', true), '') = '1' then
    return new;
  end if;
  if old.status <> 'RESERVED' then
    new.status := old.status;
    new.inside_count := old.inside_count;
    new.paid := greatest(coalesce(old.paid, 0), coalesce(new.paid, 0));
    new.debt := least(coalesce(old.debt, 0), coalesce(new.debt, 0));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_gate_state on tickets;
create trigger trg_protect_gate_state before update on tickets
  for each row execute function public.protect_ticket_gate_state();

-- ─── 2) Kapı aksiyonları (durum kontrollü) ───
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
  v_active boolean;
  v_cap int;
  v_delta int;
  v_new_inside int;
  v_new_debt numeric;
  v_paid numeric;
begin
  perform set_config('bp.gate', '1', true);

  select * into v_ticket from tickets where ticket_hash = p_ticket_hash for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_ticket.status = 'RESERVED' then
    return jsonb_build_object('ok', false, 'reason', 'reserved');
  end if;

  v_cap := greatest(coalesce(v_ticket.people_count, 1), 1);
  v_delta := greatest(coalesce(p_people_delta, 1), 1);

  if p_action in ('IN', 'MORE', 'DEBT_PAY', 'DEBT_SKIP') then
    select coalesce(is_active, true) into v_active from events where id = v_ticket.event_id;
    if v_active is false then
      return jsonb_build_object('ok', false, 'reason', 'event_inactive');
    end if;
  end if;

  if p_action = 'IN' then
    if v_ticket.status = 'INSIDE' then return jsonb_build_object('ok', false, 'reason', 'already_inside'); end if;
    if v_ticket.status = 'OUTSIDE' then return jsonb_build_object('ok', false, 'reason', 'is_outside'); end if;
    if coalesce(v_ticket.debt, 0) > 0 then
      return jsonb_build_object('ok', false, 'reason', 'debt_pending', 'debt', v_ticket.debt);
    end if;
    if coalesce(v_ticket.inside_count, 0) >= v_cap then return jsonb_build_object('ok', false, 'reason', 'capacity_full'); end if;
    v_delta := least(v_delta, v_cap - coalesce(v_ticket.inside_count, 0));

    update tickets set status = 'INSIDE', inside_count = coalesce(inside_count, 0) + v_delta,
           checkin_time = now(), updated_at = now() where id = v_ticket.id;
    insert into checkins(event_id, ticket_id, ticket_hash, gate_id, action, people_delta, actor_username)
    values(v_ticket.event_id, v_ticket.id, v_ticket.ticket_hash, p_gate_id, 'IN', v_delta, p_gate_user);
    return jsonb_build_object('ok', true, 'reason', 'checked_in', 'inside_count', coalesce(v_ticket.inside_count, 0) + v_delta);
  end if;

  if p_action = 'MORE' then
    if v_ticket.status <> 'INSIDE' then return jsonb_build_object('ok', false, 'reason', 'not_inside'); end if;
    if coalesce(v_ticket.inside_count, 0) >= v_cap then return jsonb_build_object('ok', false, 'reason', 'capacity_full'); end if;
    v_delta := least(v_delta, v_cap - coalesce(v_ticket.inside_count, 0));

    update tickets set inside_count = coalesce(inside_count, 0) + v_delta, updated_at = now() where id = v_ticket.id;
    insert into checkins(event_id, ticket_id, ticket_hash, gate_id, action, people_delta, actor_username)
    values(v_ticket.event_id, v_ticket.id, v_ticket.ticket_hash, p_gate_id, 'MORE', v_delta, p_gate_user);
    return jsonb_build_object('ok', true, 'reason', 'more_checked_in', 'inside_count', coalesce(v_ticket.inside_count, 0) + v_delta);
  end if;

  if p_action = 'DEBT_PAY' then
    if v_ticket.status = 'INSIDE' then return jsonb_build_object('ok', false, 'reason', 'already_inside'); end if;
    if coalesce(v_ticket.debt, 0) <= 0 then return jsonb_build_object('ok', false, 'reason', 'no_debt'); end if;
    if coalesce(v_ticket.inside_count, 0) >= v_cap then return jsonb_build_object('ok', false, 'reason', 'capacity_full'); end if;
    v_delta := least(v_delta, v_cap - coalesce(v_ticket.inside_count, 0));
    v_paid := least(greatest(coalesce(p_paid_delta, 0), 0), v_ticket.debt);
    v_new_debt := greatest(v_ticket.debt - v_paid, 0);
    if p_debt_after is not null then v_new_debt := least(greatest(p_debt_after, 0), v_ticket.debt); end if;

    update tickets set status = 'INSIDE', inside_count = coalesce(inside_count, 0) + v_delta,
           paid = coalesce(paid, 0) + v_paid, debt = v_new_debt, checkin_time = now(), updated_at = now()
     where id = v_ticket.id;
    insert into checkins(event_id, ticket_id, ticket_hash, gate_id, action, people_delta, paid_delta, debt_after, actor_username)
    values(v_ticket.event_id, v_ticket.id, v_ticket.ticket_hash, p_gate_id, 'DEBT_PAY', v_delta, v_paid, v_new_debt, p_gate_user);
    return jsonb_build_object('ok', true, 'reason', 'debt_paid_and_checked_in', 'debt_after', v_new_debt);
  end if;

  if p_action = 'DEBT_SKIP' then
    if v_ticket.status = 'INSIDE' then return jsonb_build_object('ok', false, 'reason', 'already_inside'); end if;
    if coalesce(v_ticket.debt, 0) <= 0 then return jsonb_build_object('ok', false, 'reason', 'no_debt'); end if;
    if coalesce(v_ticket.inside_count, 0) >= v_cap then return jsonb_build_object('ok', false, 'reason', 'capacity_full'); end if;

    update tickets set status = 'INSIDE', inside_count = coalesce(inside_count, 0) + 1,
           checkin_time = now(), updated_at = now() where id = v_ticket.id;
    insert into checkins(event_id, ticket_id, ticket_hash, gate_id, action, people_delta, debt_after, actor_username)
    values(v_ticket.event_id, v_ticket.id, v_ticket.ticket_hash, p_gate_id, 'DEBT_SKIP', 1, coalesce(v_ticket.debt, 0), p_gate_user);
    return jsonb_build_object('ok', true, 'reason', 'debt_skipped');
  end if;

  if p_action = 'OUT' then
    if v_ticket.status <> 'INSIDE' then return jsonb_build_object('ok', false, 'reason', 'not_inside'); end if;
    update tickets set status = 'OUTSIDE', last_out_time = now(), updated_at = now() where id = v_ticket.id;
    insert into checkins(event_id, ticket_id, ticket_hash, gate_id, action, people_delta, actor_username)
    values(v_ticket.event_id, v_ticket.id, v_ticket.ticket_hash, p_gate_id, 'OUT', 0, p_gate_user);
    return jsonb_build_object('ok', true, 'reason', 'set_outside');
  end if;

  if p_action = 'REIN' then
    if v_ticket.status <> 'OUTSIDE' then return jsonb_build_object('ok', false, 'reason', 'not_outside'); end if;
    update tickets set status = 'INSIDE', updated_at = now() where id = v_ticket.id;
    insert into checkins(event_id, ticket_id, ticket_hash, gate_id, action, people_delta, actor_username)
    values(v_ticket.event_id, v_ticket.id, v_ticket.ticket_hash, p_gate_id, 'REIN', 0, p_gate_user);
    return jsonb_build_object('ok', true, 'reason', 'set_inside_again');
  end if;

  return jsonb_build_object('ok', false, 'reason', 'unknown_action');
end;
$$;

revoke execute on function ticket_gate_action_atomic(text,text,text,text,int,numeric,numeric) from public, anon;
grant  execute on function ticket_gate_action_atomic(text,text,text,text,int,numeric,numeric) to authenticated;

-- ─── 3) Pasif etkinlikte satış yapılamaz ───
create or replace function ticket_sale_atomic(
  p_legacy_event_id text,
  p_tickets jsonb,
  p_convert_tables text[] default '{}'::text[]
)
returns jsonb
language plpgsql
as $$
declare
  v_event_id uuid;
  v_active boolean;
  v_conflicts jsonb;
  v_reserved jsonb;
  v_inserted_count int := 0;
begin
  if p_legacy_event_id is null or btrim(p_legacy_event_id) = '' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_event_id');
  end if;

  if p_tickets is null or jsonb_typeof(p_tickets) <> 'array' or jsonb_array_length(p_tickets) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_ticket_payload');
  end if;

  select id, coalesce(is_active, true) into v_event_id, v_active
  from events
  where legacy_event_id = p_legacy_event_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'event_not_found');
  end if;

  if v_active is false then
    return jsonb_build_object('ok', false, 'reason', 'event_inactive');
  end if;

  with req as (
    select nullif(btrim(x->>'table_no'), '') as table_no
    from jsonb_array_elements(p_tickets) as x
  )
  select coalesce(jsonb_object_agg(t.table_no, coalesce(t.customer_name, 'Bilinmiyor')), '{}'::jsonb)
  into v_conflicts
  from tickets t
  join req r on r.table_no is not null and t.table_no = r.table_no
  where t.event_id = v_event_id and t.status <> 'RESERVED';

  if v_conflicts <> '{}'::jsonb then
    return jsonb_build_object('ok', false, 'reason', 'already_sold', 'soldTo', v_conflicts);
  end if;

  with req as (
    select nullif(btrim(x->>'table_no'), '') as table_no
    from jsonb_array_elements(p_tickets) as x
  )
  select coalesce(jsonb_object_agg(t.table_no, coalesce(t.customer_name, 'Rezerve')), '{}'::jsonb)
  into v_reserved
  from tickets t
  join req r on r.table_no is not null and t.table_no = r.table_no
  where t.event_id = v_event_id and t.status = 'RESERVED'
    and t.table_no <> all (coalesce(p_convert_tables, '{}'::text[]));

  if v_reserved <> '{}'::jsonb then
    return jsonb_build_object('ok', false, 'reason', 'already_reserved', 'reservedFor', v_reserved);
  end if;

  delete from tickets
  where event_id = v_event_id and status = 'RESERVED'
    and table_no = any (coalesce(p_convert_tables, '{}'::text[]));

  insert into tickets(
    event_id, ticket_hash, category_name, table_no, customer_name, customer_phone, sold_by_username,
    people_count, inside_count, paid, debt, status, payload_json, created_at, updated_at
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
    now(), now()
  from jsonb_array_elements(p_tickets) as x;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  return jsonb_build_object('ok', true, 'reason', 'sale_committed', 'inserted', v_inserted_count);

exception
  when unique_violation then
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

revoke execute on function ticket_sale_atomic(text,jsonb,text[]) from public, anon;
grant  execute on function ticket_sale_atomic(text,jsonb,text[]) to authenticated;


-- ─── 4) İptal koruması (supabase_iptal_koruma.sql içeriği) ───
-- Tekrar çalıştırmak zararsızdır.

create or replace function public.block_cancelled_ticket()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from app_config
     where key = 'BiletPro_CancelledTickets'
       and jsonb_typeof(value) = 'array'
       and value ? new.ticket_hash
  ) then
    return null;    -- eklemeyi iptal et (hata vermeden)
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_cancelled_ticket on tickets;
create trigger trg_block_cancelled_ticket
  before insert on tickets
  for each row execute function public.block_cancelled_ticket();
