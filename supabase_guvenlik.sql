-- BiletPro güvenlik katmanı (v1)
-- Supabase SQL Editor'de, supabase_schema.sql çalıştırıldıktan SONRA bir kez çalıştırın.
--
-- Mantık:
--  * Personelin her biri Supabase Auth'ta bir hesaptır: <kullanıcıadı>@biletpro.app
--  * Anonim (giriş yapmamış) kullanıcı hiçbir tabloyu okuyup yazamaz.
--  * Giriş yapmış personel operasyon tablolarını kullanır.
--  * Personel listesi ve sistem ayarı sadece yönetici (admin) tarafından değiştirilir.
--  * Personel ekleme / şifre değiştirme / pasife alma yalnızca admin'in çağırabildiği
--    fonksiyonlarla yapılır (service_role anahtarı tarayıcıda asla bulunmaz).

create extension if not exists pgcrypto with schema extensions;

-- ─── Yardımcı: çağıran admin mi? ───
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'app_role', '') = 'admin';
$$;

-- ─── RLS: eski "herkese açık" durumu kapat, yeni politikaları kur ───
alter table app_config enable row level security;
alter table users_app  enable row level security;
alter table events     enable row level security;
alter table tickets    enable row level security;
alter table checkins   enable row level security;
alter table audit_logs enable row level security;

do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Operasyon tabloları: giriş yapmış herkes (anon hiçbir şey göremez)
create policy ops_all on events     for all to authenticated using (true) with check (true);
create policy ops_all on tickets    for all to authenticated using (true) with check (true);
create policy ops_all on checkins   for all to authenticated using (true) with check (true);

-- Denetim kayıtları: eklenebilir ve okunabilir; silmek / değiştirmek sadece admin
create policy audit_read   on audit_logs for select to authenticated using (true);
create policy audit_insert on audit_logs for insert to authenticated with check (true);
create policy audit_admin  on audit_logs for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy audit_del    on audit_logs for delete to authenticated using (public.is_admin());

-- Ayar / personel listesi: herkes okur; kritik anahtarları sadece admin yazar
create policy cfg_read  on app_config for select to authenticated using (true);
create policy cfg_write on app_config for all to authenticated
  using      (key not in ('BiletPro_Staff', 'BiletPro_Config') or public.is_admin())
  with check (key not in ('BiletPro_Staff', 'BiletPro_Config') or public.is_admin());

-- users_app tablosu kullanılmıyor: kimse erişemesin (politika yok = erişim yok)

-- ─── Fonksiyon yetkileri: anonim çağıramasın ───
revoke execute on function ticket_gate_action_atomic(text,text,text,text,int,numeric,numeric) from public, anon;
revoke execute on function ticket_checkin_atomic(text,text,text) from public, anon;
revoke execute on function ticket_sale_atomic(text,jsonb) from public, anon;
grant  execute on function ticket_gate_action_atomic(text,text,text,text,int,numeric,numeric) to authenticated;
grant  execute on function ticket_checkin_atomic(text,text,text) to authenticated;
grant  execute on function ticket_sale_atomic(text,jsonb) to authenticated;

-- ─── Personel yönetimi (sadece admin çağırabilir) ───
create or replace function public.staff_email(p_username text)
returns text language sql immutable as $$
  select lower(btrim(p_username)) || '@biletpro.app';
$$;

create or replace function public.admin_create_staff(
  p_username text,
  p_password text,
  p_app_role text default 'staff'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_uid uuid := gen_random_uuid();
  v_email text := public.staff_email(p_username);
  v_role text := case when p_app_role = 'admin' then 'admin' else 'staff' end;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if coalesce(btrim(p_username), '') = '' or p_username !~ '^[a-zA-Z0-9._-]{2,32}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_username');
  end if;
  if length(coalesce(p_password, '')) < 8 then
    return jsonb_build_object('ok', false, 'reason', 'weak_password');
  end if;
  if exists (select 1 from auth.users where email = v_email) then
    return jsonb_build_object('ok', false, 'reason', 'exists');
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'app_role', v_role),
    jsonb_build_object('username', lower(btrim(p_username))),
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_uid, v_uid::text,
          jsonb_build_object('sub', v_uid::text, 'email', v_email), 'email', now(), now(), now());

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_set_password(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if length(coalesce(p_password, '')) < 8 then
    return jsonb_build_object('ok', false, 'reason', 'weak_password');
  end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
   where email = public.staff_email(p_username);
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_set_active(p_username text, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  update auth.users
     set banned_until = case when p_active then null else 'infinity'::timestamptz end, updated_at = now()
   where email = public.staff_email(p_username);
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_set_role(p_username text, p_app_role text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                              || jsonb_build_object('app_role', case when p_app_role = 'admin' then 'admin' else 'staff' end),
         updated_at = now()
   where email = public.staff_email(p_username);
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.admin_create_staff(text,text,text) from public, anon;
revoke execute on function public.admin_set_password(text,text)      from public, anon;
revoke execute on function public.admin_set_active(text,boolean)     from public, anon;
revoke execute on function public.admin_set_role(text,text)          from public, anon;
grant  execute on function public.admin_create_staff(text,text,text) to authenticated;
grant  execute on function public.admin_set_password(text,text)      to authenticated;
grant  execute on function public.admin_set_active(text,boolean)     to authenticated;
grant  execute on function public.admin_set_role(text,text)          to authenticated;
