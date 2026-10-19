-- BiletPro: müşterinin bilet sayfasında "bu bilet kullanıldı" göstermek için public_ticket fonksiyonuna durum alanları eklenir.
-- Tekrar çalıştırmak zararsızdır. (Bilet sayfası bu alanlar yokken de çalışır; alanlar gelince işaret görünür.)

create or replace function public_ticket(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t tickets%rowtype;
  e events%rowtype;
  base text;
  v_list jsonb;
  v_logo text;
begin
  select * into t from tickets where share_token = p_token and status <> 'RESERVED';
  if not found then
    return jsonb_build_object('ok', false);
  end if;

  select * into e from events where id = t.event_id;

  base := regexp_replace(t.ticket_hash, '-M[0-9A-Za-z.]+$', '');

  select jsonb_agg(jsonb_build_object(
           'table_no', x.table_no, 'category', x.category_name, 'people', x.people_count,
           'hash', x.ticket_hash, 'debt', x.debt,
           'status', x.status, 'inside', x.inside_count,
           'color', (select c ->> 'color' from jsonb_array_elements(coalesce(e.payload_json -> 'categories', '[]'::jsonb)) c where c ->> 'name' = x.category_name limit 1)) order by x.table_no)
    into v_list
    from tickets x
   where x.event_id = t.event_id and x.status <> 'RESERVED'
     and (x.ticket_hash = t.ticket_hash or x.ticket_hash = base or x.ticket_hash like base || '-M%');

  v_logo := e.payload_json ->> 'logo';
  if v_logo is not null and length(v_logo) > 250000 then v_logo := null; end if;

  return jsonb_build_object(
    'ok', true,
    'customer', t.customer_name,
    'event', jsonb_build_object(
      'title', e.title, 'company', e.company, 'venue', e.venue, 'city', e.city, 'address', e.full_address,
      'date', e.event_date, 'door', e.door_time, 'start', e.start_time, 'logo', v_logo),
    'tickets', coalesce(v_list, '[]'::jsonb));
end;
$$;

revoke execute on function public_ticket(uuid) from public;
grant  execute on function public_ticket(uuid) to anon, authenticated;
