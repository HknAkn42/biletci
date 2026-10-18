# BiletPro günlük yedek

- Her gün **20:00 (Türkiye)** GitHub Actions "Günlük yedek" işi çalışır (`.github/workflows/yedek.yml`).
- Veritabanındaki etkinlik, bilet, kapı kayıtları, denetim günlüğü ve ayarlar okunur, sıkıştırılır ve **AES-256 ile şifrelenir** (`scripts/yedek-al.mjs`).
- Şifreli dosya (`.bpy`) Actions → ilgili çalıştırma → **Artifacts** bölümünde 90 gün saklanır. Depo herkese açık olsa da dosya parola olmadan okunamaz.
- Gerekli iki GitHub secret: `BACKUP_PASSWORD` (yedek hesabı `yedekbot`) ve `BACKUP_PASSPHRASE` (şifreleme parolası).
- Elle çalıştırmak: GitHub → Actions → Günlük yedek → **Run workflow**.
- Yedeği açmak: `BACKUP_PASSPHRASE="..." node scripts/yedek-coz.mjs yedek.bpy [cikti.json]`
- Geri yüklemek: önce kuru çalıştırma, sonra `--uygula`:
  `BACKUP_PASSPHRASE="..." RESTORE_USER=hakan RESTORE_PASSWORD="..." node scripts/yedek-geri-yukle.mjs yedek.bpy`
  Geri yükleme mevcut kayıtları günceller, eksikleri ekler, hiçbir şeyi silmez. Personel hesap şifreleri yedeğe girmez.
