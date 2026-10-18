// Yedeği veritabanına geri yükler (kayıt id'leriyle birleştirir; olanı günceller, olmayanı ekler, silmez).
// Varsayılan "kuru çalıştırma"dır: yalnızca ne yapacağını yazar. Gerçekten yüklemek için --uygula ekleyin.
// Kullanım:  BACKUP_PASSPHRASE="..." RESTORE_USER=hakan RESTORE_PASSWORD="..." node scripts/yedek-geri-yukle.mjs yedek.bpy [--uygula] [--sadece=events,tickets]
// RESTORE_USER bir yönetici olmalı (app_config yazımı için).
import { readFileSync } from 'node:fs';
import { decryptBackup } from './yedek-coz.mjs';

const URL_BASE = process.env.SUPABASE_URL || 'https://xlwmzalusrhhmxbvrmdx.supabase.co';
const ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_lYENVrZ-QIKlDSyzorUN1g_0qOELxt9';
const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const apply = args.includes('--uygula');
const only = (args.find(a => a.startsWith('--sadece=')) || '').slice(9).split(',').filter(Boolean);
const phrase = process.env.BACKUP_PASSPHRASE, user = process.env.RESTORE_USER, pass = process.env.RESTORE_PASSWORD;
if (!file || !phrase || !user || !pass) { console.error('Dosya, BACKUP_PASSPHRASE, RESTORE_USER, RESTORE_PASSWORD gerekli.'); process.exit(2); }

const ORDER = ['events', 'tickets', 'checkins', 'app_config', 'audit_logs'];   // bağımlılık sırası
const CONFLICT = { events: 'id', tickets: 'id', checkins: 'id', audit_logs: 'id', app_config: 'key' };

const backup = decryptBackup(readFileSync(file), phrase);
console.log('Yedek tarihi:', backup.createdAt, '| kayıtlar:', JSON.stringify(backup.counts), apply ? '| MOD: UYGULA' : '| MOD: kuru çalıştırma');

const lr = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${user.toLowerCase()}@biletpro.app`, password: pass }) });
const lj = await lr.json().catch(() => ({}));
if (!lr.ok || !lj.access_token) { console.error('Giriş başarısız.'); process.exit(1); }
const H = { apikey: ANON, Authorization: `Bearer ${lj.access_token}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' };

for (const t of ORDER) {
  if (only.length && !only.includes(t)) continue;
  const rows = backup.data[t]; if (!rows || !rows.length) { console.log(`${t}: yedekte kayıt yok`); continue; }
  if (!apply) { console.log(`${t}: ${rows.length} kayıt yüklenecek (kuru çalıştırma)`); continue; }
  for (let i = 0; i < rows.length; i += 200) {
    const part = rows.slice(i, i + 200);
    const r = await fetch(`${URL_BASE}/rest/v1/${t}?on_conflict=${CONFLICT[t]}`, { method: 'POST', headers: H, body: JSON.stringify(part) });
    if (!r.ok) { console.error(`${t}: HATA ${r.status} ${(await r.text()).slice(0, 300)}`); process.exit(1); }
  }
  console.log(`${t}: ${rows.length} kayıt yüklendi`);
}
console.log(apply ? 'Geri yükleme tamamlandı. Uygulamada sayfaları yenileyin.' : 'Kuru çalıştırma bitti. Gerçekten yüklemek için --uygula ekleyin.');
