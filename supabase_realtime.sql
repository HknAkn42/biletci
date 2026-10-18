-- BiletPro: Canlı (anlık) güncelleme — tabloları Supabase Realtime yayınına ekler.
-- Böylece bir kasada yapılan satış / iptal / kapı girişi diğer cihazlarda anında görünür.
-- Tekrar çalıştırmak zararsızdır.
do $$
declare t text;
begin
  foreach t in array array['events', 'tickets', 'checkins', 'app_config', 'audit_logs'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;   -- zaten ekli
      when undefined_object then null;   -- yayın yoksa geç
    end;
  end loop;
end $$;
