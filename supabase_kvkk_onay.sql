-- BiletPro: KVKK / katılım şartları ONAY KAYDI
-- Supabase SQL Editor'de bir kez çalıştırın.
--
-- Mantık:
--  * Müşteri bilet linkini her açtığında metin çıkar; "Okudum, kabul ediyorum" deyince bu fonksiyon çağrılır.
--  * Her onay ayrı satır olarak kaydedilir (kim, hangi bilet, ne zaman, hangi metin sürümü, hangi cihaz).
--  * Tabloya anonim erişim kapalı; yalnızca bilet anahtarını bilen bu fonksiyonu çağırabilir.

create table if not exists kvkk_onaylari (
  id            bigserial primary key,
  accepted_at   timestamptz not null default now(),
  ticket_id     uuid,
  event_id      uuid,
  share_token   uuid not null,
  customer_name text,
  table_no      text,
  version       text not null,
  user_agent    text
);
create index if not exists ix_kvkk_onaylari_token on kvkk_onaylari(share_token);
create index if not exists ix_kvkk_onaylari_event on kvkk_onaylari(event_id);

alter table kvkk_onaylari enable row level security;
-- Politika yok: anonim/oturumsuz kimse doğrudan okuyup yazamaz. Yönetici SQL Editor'den görür.

create or replace function kvkk_onayla(p_token uuid, p_ver text, p_ua text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t tickets%rowtype;
  v_id bigint;
begin
  select * into t from tickets where share_token = p_token and status <> 'RESERVED';
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'ticket_not_found');
  end if;

  insert into kvkk_onaylari (ticket_id, event_id, share_token, customer_name, table_no, version, user_agent)
  values (t.id, t.event_id, p_token, t.customer_name, t.table_no, coalesce(nullif(p_ver, ''), 'v1'), left(p_ua, 300))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke execute on function kvkk_onayla(uuid, text, text) from public;
grant  execute on function kvkk_onayla(uuid, text, text) to anon, authenticated;

-- Kontrol sorgusu (isteğe bağlı):
--   select accepted_at, customer_name, table_no, version from kvkk_onaylari order by id desc limit 50;
