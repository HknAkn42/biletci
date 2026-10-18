-- BiletPro: İLK YÖNETİCİ HESABI (bir kez çalıştırılır)
-- supabase_guvenlik.sql çalıştırıldıktan sonra kullanılır.
--
-- ÖNEMLİ: Aşağıdaki iki değeri (v_username, v_password) kendi bilgilerinizle değiştirin,
-- sonra Supabase SQL Editor'de çalıştırın. Bu dosyayı şifre yazılı halde kaydetmeyin / paylaşmayın.
-- Sonraki personeller uygulamanın Personel sayfasından eklenir.

do $$
declare
  v_username text := 'KULLANICI_ADINIZ';      -- örn: hakan  (harf, rakam, . _ - ; 2-32 karakter)
  v_password text := 'EN_AZ_8_KARAKTERLI_SIFRE';
  v_uid uuid := gen_random_uuid();
  v_email text := lower(btrim(v_username)) || '@biletpro.app';
begin
  if v_username = 'KULLANICI_ADINIZ' or v_password = 'EN_AZ_8_KARAKTERLI_SIFRE' then
    raise exception 'Önce v_username ve v_password değerlerini değiştirin.';
  end if;
  if length(v_password) < 8 then
    raise exception 'Şifre en az 8 karakter olmalı.';
  end if;
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'Bu kullanıcı zaten var: %', v_email;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
    extensions.crypt(v_password, extensions.gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'app_role', 'admin'),
    jsonb_build_object('username', lower(btrim(v_username))),
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_uid, v_uid::text,
          jsonb_build_object('sub', v_uid::text, 'email', v_email), 'email', now(), now(), now());
end $$;
