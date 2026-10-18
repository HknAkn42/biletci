-- BiletPro: İptal edilen satışın eski/bayat bir cihazdan geri yazılmasını veritabanı seviyesinde engeller.
-- Uygulama bir satışı iptal ederken bilet kodunu app_config'teki 'BiletPro_CancelledTickets' listesine ekler.
-- Bu tetikleyici, kodu bu listede olan bir biletin tekrar eklenmesini (ör. güncellenmemiş bir telefon / sekme) sessizce reddeder.
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
