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

    // Görseller (aynı kaynaktan; tuval kirlenmez). Bulunamazsa tasarım görselsiz de çalışır.
    const ASSETS = { hero: 'assets/grand-hotel.jpg', logo: 'assets/go-event-logo.png' };
    const _imgCache = {};
    function loadImg(src) {
        if (!src) return Promise.resolve(null);
        if (_imgCache[src]) return _imgCache[src];
        _imgCache[src] = new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
        return _imgCache[src];
    }

    function hexToRgb(h) { const m = String(h || '').replace('#', '').match(/^([0-9a-f]{6})$/i); if (!m) return { r: 212, g: 160, b: 23 }; const n = parseInt(m[1], 16); return { r: n >> 16, g: (n >> 8) & 255, b: n & 255 }; }
    function lum(c) { return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255; }
    function coverDraw(ctx, img, x, y, w, h) {
        const s = Math.max(w / img.width, h / img.height), dw = img.width * s, dh = img.height * s;
        ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    }
    function spaced(t) { return String(t || '').toLocaleUpperCase('tr-TR').split('').join('  '); }

    function draw(ctx, d, A) {
        const e = d.event || {}, t = d.ticket || {};
        const col = hexToRgb(t.color), colCss = 'rgb(' + col.r + ',' + col.g + ',' + col.b + ')';
        const onCol = lum(col) > 0.6 ? '#10142a' : '#ffffff';
        const BG = '#0a0c14';
        ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';

        // ── Hero: otel fotoğrafı ──
        const HERO_H = 860;
        if (A.hero) {
            ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, HERO_H); ctx.clip();
            coverDraw(ctx, A.hero, 0, 0, W, HERO_H);
            ctx.restore();
        } else { const g0 = ctx.createLinearGradient(0, 0, 0, HERO_H); g0.addColorStop(0, '#26304f'); g0.addColorStop(1, '#10142a'); ctx.fillStyle = g0; ctx.fillRect(0, 0, W, HERO_H); }
        // koyulaştırma + alta doğru zemine erime
        const ov = ctx.createLinearGradient(0, 0, 0, HERO_H);
        ov.addColorStop(0, 'rgba(10,12,20,0.55)'); ov.addColorStop(0.35, 'rgba(10,12,20,0.35)'); ov.addColorStop(0.72, 'rgba(10,12,20,0.78)'); ov.addColorStop(1, BG);
        ctx.fillStyle = ov; ctx.fillRect(0, 0, W, HERO_H);
        // kategori renginden hafif ışık
        const tint = ctx.createRadialGradient(W / 2, HERO_H, 40, W / 2, HERO_H, 620);
        tint.addColorStop(0, 'rgba(' + col.r + ',' + col.g + ',' + col.b + ',0.28)'); tint.addColorStop(1, 'rgba(' + col.r + ',' + col.g + ',' + col.b + ',0)');
        ctx.fillStyle = tint; ctx.fillRect(0, HERO_H - 520, W, 520);

        // ── Logo ──
        if (A.logo) { const lw = 260, lh = lw * A.logo.height / A.logo.width; ctx.drawImage(A.logo, (W - lw) / 2, 56, lw, lh); }
        else { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '800 36px ' + FONT; ctx.fillText('GO EVENT', W / 2, 110); }

        // ── Başlık bloğu ──
        const dateTxt = e.date ? new Date(String(e.date).slice(0, 10) + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }) : '';
        ctx.fillStyle = 'rgba(255,255,255,0.78)'; ctx.font = '600 30px ' + FONT;
        ctx.fillText(spaced([e.venue || e.company, dateTxt].filter(Boolean).join('  ·  ')), W / 2, 560);
        const title = String(e.title || 'Etkinlik').toLocaleUpperCase('tr-TR');
        let ts = fitText(ctx, title, W - 140, 132, '900', 60);
        const lines = wrapLines(ctx, title, W - 140, 2); if (lines.length > 1) ts = Math.min(ts, 96);
        ctx.fillStyle = '#ffffff';
        lines.forEach((ln, i) => { ctx.font = '900 ' + ts + 'px ' + FONT; ctx.fillText(ln, W / 2, 680 + i * (ts + 8)); });
        const bY = 680 + (lines.length - 1) * (ts + 8);
        const time = [e.door ? 'Kapı ' + e.door : '', e.start ? 'Başlangıç ' + e.start : ''].filter(Boolean).join('   ·   ');
        if (time) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '500 32px ' + FONT; ctx.fillText(time, W / 2, bY + 62); }

        // ── Bilet kartı ──
        const cx = 70, cw = W - 140, cy = 790, ch = 965;
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 24;
        rr(ctx, cx, cy, cw, ch, 44); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.restore();
        // kategori şeridi
        ctx.save(); rr(ctx, cx, cy, cw, ch, 44); ctx.clip();
        ctx.fillStyle = colCss; ctx.fillRect(cx, cy, cw, 112);
        const sh = ctx.createLinearGradient(0, cy, 0, cy + 112); sh.addColorStop(0, 'rgba(255,255,255,0.22)'); sh.addColorStop(1, 'rgba(0,0,0,0.10)'); ctx.fillStyle = sh; ctx.fillRect(cx, cy, cw, 112);
        ctx.restore();
        ctx.fillStyle = onCol; ctx.textAlign = 'left'; ctx.font = '800 46px ' + FONT;
        ctx.fillText(String(t.category || '').toLocaleUpperCase('tr-TR'), cx + 56, cy + 71);
        ctx.textAlign = 'right'; ctx.font = '700 36px ' + FONT; ctx.fillText((t.people || '') + ' KİŞİLİK', cx + cw - 56, cy + 69);
        ctx.textAlign = 'center';

        // masa
        ctx.fillStyle = '#10142a'; ctx.font = '900 156px ' + FONT; ctx.fillText('MASA ' + (t.table_no == null ? '' : t.table_no), W / 2, cy + 265);
        // kupon çizgisi
        const perfY = cy + 318;
        ctx.fillStyle = BG; ctx.beginPath(); ctx.arc(cx, perfY, 32, 0, Math.PI * 2); ctx.arc(cx + cw, perfY, 32, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#d3d8e6'; ctx.lineWidth = 3; ctx.setLineDash([14, 12]); ctx.beginPath(); ctx.moveTo(cx + 54, perfY); ctx.lineTo(cx + cw - 54, perfY); ctx.stroke(); ctx.setLineDash([]);

        // QR
        const qs = 440, qx = (W - qs) / 2, qy = perfY + 46;
        ctx.strokeStyle = colCss; ctx.lineWidth = 8; rr(ctx, qx - 24, qy - 24, qs + 48, qs + 48, 30); ctx.stroke();
        drawQR(ctx, t.hash, qx, qy, qs);
        // müşteri
        ctx.fillStyle = '#10142a'; const nm = String(d.customer || '').trim();
        fitText(ctx, nm, cw - 120, 50, '800', 28); ctx.fillText(nm, W / 2, qy + qs + 92);
        const mono = 'ui-monospace,Menlo,Consolas,monospace'; const hs = String(t.hash || '');
        ctx.fillStyle = '#8a91a8'; let hsz = 26; do { ctx.font = '600 ' + hsz + 'px ' + mono; if (ctx.measureText(hs).width <= cw - 100) break; hsz -= 2; } while (hsz > 14);
        ctx.fillText(hs, W / 2, qy + qs + 134);

        // borç
        let y = cy + ch + 56;
        if (Number(t.debt) > 0.5) {
            rr(ctx, 120, y - 46, W - 240, 84, 22); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
            ctx.strokeStyle = colCss; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = '#ffffff'; ctx.font = '700 36px ' + FONT;
            ctx.fillText('Kapıda ödenecek: ₺' + Number(t.debt).toLocaleString('tr-TR', { maximumFractionDigits: 0 }), W / 2, y + 10);
            y += 82;
        }
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '500 28px ' + FONT;
        ctx.fillText('Girişte bu QR kodu görevliye okutunuz', W / 2, Math.min(y + 34, H - 44));
    }

    async function make(data) {
        try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (_) {}
        const A = { hero: await loadImg(ASSETS.hero), logo: await loadImg(ASSETS.logo) };
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const ctx = c.getContext('2d');
        draw(ctx, data, A);
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
