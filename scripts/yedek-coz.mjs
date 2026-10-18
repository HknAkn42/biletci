// Şifreli yedek dosyasını (.bpy) çözer.
// Kullanım:  BACKUP_PASSPHRASE="..." node scripts/yedek-coz.mjs yedek.bpy [cikti.json]
import { gunzipSync } from 'node:zlib';
import { scryptSync, createDecipheriv } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

export function decryptBackup(buf, phrase) {
  if (buf.subarray(0, 8).toString() !== 'BPYEDEK1') throw new Error('Geçerli bir BiletPro yedeği değil.');
  const salt = buf.subarray(8, 24), iv = buf.subarray(24, 36), tag = buf.subarray(36, 52), enc = buf.subarray(52);
  const d = createDecipheriv('aes-256-gcm', scryptSync(phrase, salt, 32), iv);
  d.setAuthTag(tag);
  let plain;
  try { plain = Buffer.concat([d.update(enc), d.final()]); } catch (_) { throw new Error('Parola yanlış veya dosya bozuk.'); }
  return JSON.parse(gunzipSync(plain).toString('utf8'));
}

if (process.argv[1] && process.argv[1].endsWith('yedek-coz.mjs')) {
  const [, , inFile, outFile] = process.argv;
  const phrase = process.env.BACKUP_PASSPHRASE;
  if (!inFile || !phrase) { console.error('Kullanım: BACKUP_PASSPHRASE="..." node scripts/yedek-coz.mjs yedek.bpy [cikti.json]'); process.exit(2); }
  const data = decryptBackup(readFileSync(inFile), phrase);
  console.log('Yedek tarihi:', data.createdAt, '| kayıt sayıları:', JSON.stringify(data.counts));
  if (outFile) { writeFileSync(outFile, JSON.stringify(data, null, 2)); console.log('Çözülen dosya yazıldı:', outFile); }
}
