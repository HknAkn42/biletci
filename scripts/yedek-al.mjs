// BiletPro veritabanı yedeği: Supabase tablolarını okur, sıkıştırır, AES-256-GCM ile şifreler ve dosyaya yazar.
// Gerekli ortam değişkenleri: BACKUP_USER, BACKUP_PASSWORD (yedek hesabı), BACKUP_PASSPHRASE (şifreleme parolası)
// İsteğe bağlı: BACKUP_OUT_DIR (varsayılan: ./yedek-cikti)
import { gzipSync } from 'node:zlib';
import { randomBytes, scryptSync, createCipheriv } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const URL_BASE = process.env.SUPABASE_URL || 'https://xlwmzalusrhhmxbvrmdx.supabase.co';
const ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_lYENVrZ-QIKlDSyzorUN1g_0qOELxt9';
const USER = process.env.BACKUP_USER || 'yedekbot';
const PASS = process.env.BACKUP_PASSWORD;
const PHRASE = process.env.BACKUP_PASSPHRASE;
const OUT = process.env.BACKUP_OUT_DIR || './yedek-cikti';

if (!PASS || !PHRASE) { console.error('BACKUP_PASSWORD ve BACKUP_PASSPHRASE gerekli.'); process.exit(2); }
if (PHRASE.length < 16) { console.error('BACKUP_PASSPHRASE en az 16 karakter olmalı.'); process.exit(2); }

const TABLES = [
  { name: 'events', order: 'id', required: true },
  { name: 'tickets', order: 'id', required: true },
  { name: 'checkins', order: 'id', required: true },
  { name: 'audit_logs', order: 'id', required: false },
  { name: 'app_config', order: 'key', required: true }
];

async function login() {
  const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${USER.toLowerCase()}@biletpro.app`, password: PASS })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Yedek hesabı girişi başarısız: ' + (j.error_description || j.msg || r.status));
  return j.access_token;
}

async function dump(token, t) {
  const rows = [];
  const page = 1000;
  for (let off = 0; ; off += page) {
    const r = await fetch(`${URL_BASE}/rest/v1/${t.name}?select=*&order=${t.order}.asc&limit=${page}&offset=${off}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${token}` }
    });
    if (!r.ok) {
      const msg = await r.text().catch(() => '');
      if (!t.required) { console.warn(`UYARI: ${t.name} okunamadı (${r.status}) — atlandı`); return null; }
      throw new Error(`${t.name} okunamadı: ${r.status} ${msg.slice(0, 200)}`);
    }
    const part = await r.json();
    rows.push(...part);
    if (part.length < page) break;
  }
  return rows;
}

function encrypt(buf) {
  const salt = randomBytes(16), iv = randomBytes(12);
  const key = scryptSync(PHRASE, salt, 32);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([Buffer.from('BPYEDEK1'), salt, iv, c.getAuthTag(), enc]);
}

const token = await login();
const data = {};
const counts = {};
for (const t of TABLES) {
  const rows = await dump(token, t);
  if (rows) { data[t.name] = rows; counts[t.name] = rows.length; }
}

// Sağlık kontrolü: gerçek etkinlik yoksa yedek geçersiz sayılır (okuma yetkisi sorunu olabilir)
if (!counts.events) throw new Error('Yedekte hiç etkinlik yok — okuma yetkisi veya veri sorunu. Yedek kaydedilmedi.');

const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);   // 2026-10-18-17-00 (UTC)
const payload = { format: 'biletpro-yedek-1', createdAt: new Date().toISOString(), counts, data };
const packed = encrypt(gzipSync(Buffer.from(JSON.stringify(payload), 'utf8')));
mkdirSync(OUT, { recursive: true });
const file = join(OUT, `biletpro-yedek-${stamp}.bpy`);
writeFileSync(file, packed);
console.log('Yedek yazıldı:', file, '|', Math.round(packed.length / 1024) + ' KB |', JSON.stringify(counts));
