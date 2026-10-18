/**
 * BiletPro | Bilet görseli (JPEG) üretici
 * Bilet bilgilerinden 1080x1920 (WhatsApp'ta tam ekran okunur) bir resim çizer.
 * Gereken: qrcode-generator (qrcode()). Tasarım değişince yalnızca draw() fonksiyonu güncellenir.
 *
 *   TicketImage.make({ event:{title,company,venue,city,date,door,start}, customer, ticket:{table_no,category,people,hash,debt} })
 *     -> Promise<Blob>   (image/jpeg)
 */
(function () {
    'use strict';
    const W = 1080, H = 1920;
    const FONT = "'Inter','Segoe UI',Roboto,Helvetica,Arial,sans-serif";

    function rr(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }

    function fitText(ctx, text, maxW, size, weight, minSize) {
        let s = size;
        do { ctx.font = weight + ' ' + s + 'px ' + FONT; if (ctx.measureText(text).width <= maxW) break; s -= 2; } while (s > (minSize || 24));
        return s;
    }

    function wrapLines(ctx, text, maxW, maxLines) {
        const words = String(text).split(/\s+/), lines = []; let cur = '';
        words.forEach(w => { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
        if (cur) lines.push(cur);
        return lines.slice(0, maxLines || 3);
    }

    function drawQR(ctx, text, x, y, size) {
        const qr = qrcode(0, 'H'); qr.addData(String(text)); qr.make();
        const n = qr.getModuleCount(), cell = size / n;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, size, size);
        ctx.fillStyle = '#000000';
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(Math.floor(x + c * cell), Math.floor(y + r * cell), Math.ceil(cell), Math.ceil(cell));
    }

    function draw(ctx, d) {
        const e = d.event || {}, t = d.ticket || {};
        // Arka plan
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#0b1020'); g.addColorStop(0.55, '#141a33'); g.addColorStop(1, '#0b1020');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        const glow = ctx.createRadialGradient(W / 2, 120, 40, W / 2, 120, 700);
        glow.addColorStop(0, 'rgba(212,160,23,0.28)'); glow.addColorStop(1, 'rgba(212,160,23,0)');
        ctx.fillStyle = glow; ctx.fillRect(0, 0, W, 900);

        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        // Marka / firma
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '600 30px ' + FONT;
        ctx.fillText(String(e.company || 'GİRİŞ BİLETİ').toLocaleUpperCase('tr-TR').split('').join(' '), W / 2, 120);
        // altın çizgi
        const gl = ctx.createLinearGradient(240, 0, 840, 0);
        gl.addColorStop(0, 'rgba(212,160,23,0)'); gl.addColorStop(0.5, '#e6b93a'); gl.addColorStop(1, 'rgba(212,160,23,0)');
        ctx.fillStyle = gl; ctx.fillRect(240, 150, 600, 4);

        // Etkinlik adı
        ctx.fillStyle = '#ffffff';
        const title = String(e.title || 'Etkinlik');
        let ts = fitText(ctx, title, W - 160, 96, '800', 52);
        const tl = wrapLines(ctx, title, W - 160, 2);
        if (tl.length > 1) { ts = 72; ctx.font = '800 ' + ts + 'px ' + FONT; }
        tl.forEach((ln, i) => { ctx.font = '800 ' + ts + 'px ' + FONT; ctx.fillText(ln, W / 2, 270 + i * (ts + 10)); });
        const afterTitle = 270 + (tl.length - 1) * (ts + 10);

        // Tarih / saat / mekan
        const date = e.date ? new Date(String(e.date).slice(0, 10) + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }) : '';
        const time = [e.door ? 'Kapı ' + e.door : '', e.start ? 'Başlangıç ' + e.start : ''].filter(Boolean).join('  ·  ');
        const venue = [e.venue, e.city].filter(Boolean).join(' · ');
        ctx.fillStyle = '#e6b93a'; ctx.font = '700 40px ' + FONT; ctx.fillText(date, W / 2, afterTitle + 90);
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '500 34px ' + FONT;
        let yy = afterTitle + 150; if (time) { ctx.fillText(time, W / 2, yy); yy += 52; }
        if (venue) { ctx.fillText(venue, W / 2, yy); yy += 52; }

        // Bilet kartı
        const cx = 90, cw = W - 180, cy = Math.max(yy + 40, 560), ch = 1090;
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20;
        rr(ctx, cx, cy, cw, ch, 48); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.restore();
        // kupon deliği çizgisi
        const perfY = cy + 300;
        ctx.fillStyle = '#0f1530'; ctx.beginPath(); ctx.arc(cx, perfY, 30, 0, Math.PI * 2); ctx.arc(cx + cw, perfY, 30, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#d5d9e6'; ctx.lineWidth = 3; ctx.setLineDash([14, 12]); ctx.beginPath(); ctx.moveTo(cx + 50, perfY); ctx.lineTo(cx + cw - 50, perfY); ctx.stroke(); ctx.setLineDash([]);

        // Kart üst: masa
        ctx.fillStyle = '#7a8299'; ctx.font = '700 30px ' + FONT; ctx.fillText(String(t.category || '').toLocaleUpperCase('tr-TR'), W / 2, cy + 85);
        ctx.fillStyle = '#10142a'; ctx.font = '800 150px ' + FONT; ctx.fillText('MASA ' + (t.table_no == null ? '' : t.table_no), W / 2, cy + 225);
        ctx.fillStyle = '#4a5270'; ctx.font = '600 34px ' + FONT; ctx.fillText((t.people || '') + ' kişilik', W / 2, cy + 275);

        // Kart alt: QR
        const qs = 500; drawQR(ctx, t.hash, (W - qs) / 2, perfY + 70, qs);
        ctx.strokeStyle = '#e3e6f0'; ctx.lineWidth = 4; rr(ctx, (W - qs) / 2 - 18, perfY + 52, qs + 36, qs + 36, 24); ctx.stroke();
        ctx.fillStyle = '#10142a'; const nm = String(d.customer || '').trim();
        fitText(ctx, nm, cw - 120, 48, '800', 28); ctx.fillText(nm, W / 2, perfY + 70 + qs + 100);
        ctx.fillStyle = '#8a91a8'; ctx.font = '600 26px ui-monospace,Menlo,Consolas,monospace';
        const hs = String(t.hash || ''); fitText(ctx, hs, cw - 100, 26, '600', 16); ctx.font = ctx.font.replace(FONT, 'ui-monospace,Menlo,Consolas,monospace'); ctx.fillText(hs, W / 2, perfY + 70 + qs + 150);

        // Borç uyarısı
        let yBottom = cy + ch + 70;
        if (Number(t.debt) > 0.5) {
            rr(ctx, 140, yBottom - 52, W - 280, 90, 24); ctx.fillStyle = 'rgba(230,185,58,0.16)'; ctx.fill();
            ctx.strokeStyle = 'rgba(230,185,58,0.6)'; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = '#f0c75a'; ctx.font = '700 38px ' + FONT;
            ctx.fillText('Kapıda ödenecek: ₺' + Number(t.debt).toLocaleString('tr-TR', { maximumFractionDigits: 0 }), W / 2, yBottom + 8);
            yBottom += 100;
        }
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '500 30px ' + FONT;
        ctx.fillText('Girişte bu QR kodu görevliye okutunuz', W / 2, Math.min(yBottom + 30, H - 70));
    }

    async function make(data) {
        try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (_) {}
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const ctx = c.getContext('2d');
        draw(ctx, data);
        return await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('görsel üretilemedi')), 'image/jpeg', 0.92));
    }

    function fileName(data) {
        const clean = (s) => String(s || '').toLocaleLowerCase('tr-TR').replace(/[^a-z0-9ğüşıöç]+/gi, '-').replace(/^-+|-+$/g, '');
        return 'bilet-' + clean(data.event && data.event.title) + '-masa-' + clean(data.ticket && data.ticket.table_no) + '.jpg';
    }

    // Paylaşım menüsü (telefon) → olmazsa indir
    async function shareOrDownload(datas, text) {
        const files = [];
        for (const d of datas) files.push(new File([await make(d)], fileName(d), { type: 'image/jpeg' }));
        if (navigator.canShare && navigator.canShare({ files })) {
            try { await navigator.share({ files, text: text || '' }); return 'shared'; }
            catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
        }
        files.forEach((f, i) => { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); setTimeout(() => { a.click(); a.remove(); }, i * 250); });
        return 'downloaded';
    }

    window.TicketImage = { make, fileName, shareOrDownload, W, H };
})();
