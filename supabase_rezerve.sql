-- BiletPro: Masa REZERVASYONU (ödeme almadan masa tutma)
-- Supabase SQL Editor'de supabase_schema.sql ve supabase_guvenlik.sql'den SONRA bir kez çalıştırın.
--
-- Mantık:
--  * Rezerve masa, tickets tablosunda status = 'RESERVED' olan bir satırdır (bilet / QR yok, ödeme yok).
--  * (event_id, table_no) benzersiz olduğu için rezerve masa aynı anda iki kez tutulamaz ve satılamaz.
--  * Rezerve masa ancak satışa çevrilirken (p_convert_tables ile açıkça belirtilirse) satılabilir.
--  * Rezerve satır kapıdan geçemez (tetikleyici ile korunur).

-- ─── Rezerve et ───
create or replace function ticket_reserve_atomic(
  p_legacy_event_id text,
  p_table_no text,
  p_category text,
  p_customer_name text,
  p_customer_phone text,
  p_people int,
  p_note text,
  p_reserved_by text,
  p_hold_until timestamptz default null
)
returns jsonb
language plpgsql
as $$
declare
  v_event_id uuid;
  v_existing tickets%rowtype;
  v_table text := nullif(btrim(p_table_no), '');
begin
  if v_table is null or coalesce(btrim(p_customer_name), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_params');
  end if;

  select id into v_event_id from events where legacy_event_id = p_legacy_event_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'event_not_found');
  end if;

  select * into v_existing from tickets where event_id = v_event_id and table_no = v_table;
  if found then
    return jsonb_build_object('ok', false,
      'reason', case when v_existing.status = 'RESERVED' then 'already_reserved' else 'already_sold' end,
      'takenBy', coalesce(v_existing.customer_name, 'Bilinmiyor'));
  end if;

  insert into tickets (event_id, ticket_hash, category_name, table_no, customer_name, customer_phone,
                       sold_by_username, people_count, inside_count, paid, debt, status, payload_json)
  values (v_event_id, 'RSV-' || gen_random_uuid()::text, nullif(p_category, ''), v_table,
          btrim(p_customer_name), nullif(btrim(coalesce(p_customer_phone, '')), ''),
          nullif(p_reserved_by, ''), greatest(coalesce(p_people, 1), 1), 0, 0, 0, 'RESERVED',
          jsonb_build_object('reservation', jsonb_build_object(
            'note', coalesce(p_note, ''), 'reservedBy', coalesce(p_reserved_by, ''),
            'holdUntil', p_hold_until, 'reservedAt', now())));

  return jsonb_build_object('ok', true, 'reason', 'reserved');
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already_reserved', 'takenBy', 'Bilinmiyor');
  when others then
    return jsonb_build_object('ok', false, 'reason', 'rpc_error', 'message', SQLERRM);
end;
$$;

-- ─── Rezervasyonu kaldır ───
create or replace function ticket_reservation_cancel(p_legacy_event_id text, p_table_no text)
returns jsonb
language plpgsql
as $$
declare
  v_event_id uuid;
begin
  select id into v_event_id from events where legacy_event_id = p_legacy_event_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'event_not_found');
  end if;
  delete from tickets where event_id = v_event_id and table_no = btrim(p_table_no) and status = 'RESERVED';
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'reason', 'released');
end;
$$;

-- ─── Satış fonksiyonu: rezerve masaları açıkça satışa çevirebilir ───
drop function if exists ticket_sale_atomic(text, jsonb);

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

  select id into v_event_id
  from events
  where legacy_event_id = p_legacy_event_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'event_not_found');
  end if;

  -- Satılmış masalar (rezerve olmayanlar)
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

  -- Rezerve masalar: yalnızca açıkça satışa çevrilenler satılabilir
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

  -- Satışa çevrilen rezervasyonları kaldır (aynı işlemde yeni bilet yazılır)
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

-- ─── Güvenlik ağı: rezerve satır kapıdan geçemez ───
create or replace function block_reserved_gate()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'RESERVED' and new.status in ('INSIDE', 'OUTSIDE') then
    raise exception 'Rezerve masa için bilet düzenlenmemiş; önce satışa çevrilmeli.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_reserved_gate on tickets;
create trigger trg_block_reserved_gate before update on tickets
  for each row execute function block_reserved_gate();

-- ─── Yetkiler ───
revoke execute on function ticket_reserve_atomic(text,text,text,text,text,int,text,text,timestamptz) from public, anon;
revoke execute on function ticket_reservation_cancel(text,text) from public, anon;
revoke execute on function ticket_sale_atomic(text,jsonb,text[]) from public, anon;
grant  execute on function ticket_reserve_atomic(text,text,text,text,text,int,text,text,timestamptz) to authenticated;
grant  execute on function ticket_reservation_cancel(text,text) to authenticated;
grant  execute on function ticket_sale_atomic(text,jsonb,text[]) to authenticated;
