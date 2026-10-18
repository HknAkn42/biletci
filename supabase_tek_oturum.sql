-- BiletPro: TEK OTURUM (aynı hesapla ikinci cihaz girişi uyarısı ve eski cihazın kapatılması)
-- Supabase SQL Editor'de bir kez çalıştırın (supabase_guvenlik.sql sonrası).
--
-- Kurallar:
--  * Personel hesabı aynı anda yalnızca BİR cihazda açık olabilir.
--  * Başka cihazdan giriş yapılırsa önce uyarı çıkar; onaylanırsa eski cihazın oturumu kapanır.
--  * Yönetici (admin) hesapları bu kuraldan muaftır.
--  * Tabloya doğrudan erişim yoktur; yalnızca aşağıdaki fonksiyonlar kullanılır.

create table if not exists user_sessions (
  username   text primary key,
  session_id uuid not null,
  device     text,
  claimed_at timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);
alter table user_sessions enable row level security;   -- politika yok: doğrudan erişim kapalı

create or replace function public.current_username()
returns text language sql stable as $$
  select lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'username', split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1)));
$$;

-- Oturum al. Başka cihazda canlı oturum varsa p_force = false iken uyarı döner.
create or replace function public.claim_session(p_device text, p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user text := public.current_username();
  v_cur user_sessions%rowtype;
  v_new uuid := gen_random_uuid();
begin
  if coalesce(v_user, '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'no_user');
  end if;
  if public.is_admin() then
    return jsonb_build_object('ok', true, 'session_id', v_new, 'exempt', true);
  end if;

  select * into v_cur from user_sessions where username = v_user;
  if found and not p_force and v_cur.last_seen > now() - interval '90 seconds' then
    return jsonb_build_object('ok', false, 'reason', 'in_use', 'device', v_cur.device, 'last_seen', v_cur.last_seen);
  end if;

  insert into user_sessions (username, session_id, device, claimed_at, last_seen)
  values (v_user, v_new, left(coalesce(p_device, ''), 120), now(), now())
  on conflict (username) do update
     set session_id = excluded.session_id, device = excluded.device, claimed_at = now(), last_seen = now();

  return jsonb_build_object('ok', true, 'session_id', v_new, 'replaced', found);
end;
$$;

-- Canlı tutma + hâlâ geçerli oturum mu kontrolü
create or replace function public.session_heartbeat(p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user text := public.current_username();
  v_cur user_sessions%rowtype;
begin
  if public.is_admin() then
    return jsonb_build_object('ok', true, 'exempt', true);
  end if;
  select * into v_cur from user_sessions where username = v_user;
  if not found then
    -- kayıt silinmiş (ör. çıkış yapılmış): oturumu yeniden sahiplen
    insert into user_sessions (username, session_id, device) values (v_user, p_session, null)
    on conflict (username) do nothing;
    return jsonb_build_object('ok', true);
  end if;
  if v_cur.session_id = p_session then
    update user_sessions set last_seen = now() where username = v_user;
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'reason', 'replaced', 'device', v_cur.device);
end;
$$;

-- Çıkış yapınca oturumu bırak
create or replace function public.release_session(p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from user_sessions where username = public.current_username() and session_id = p_session;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.claim_session(text, boolean) from public, anon;
revoke execute on function public.session_heartbeat(uuid) from public, anon;
revoke execute on function public.release_session(uuid) from public, anon;
grant  execute on function public.claim_session(text, boolean) to authenticated;
grant  execute on function public.session_heartbeat(uuid) to authenticated;
grant  execute on function public.release_session(uuid) to authenticated;
