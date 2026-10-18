/**
 * BiletPro | Oturma düzeni (plan) modülü
 * - Etkinliğin masalarını ve sahneyi SVG plan olarak çizer.
 * - Düzenleme (editor) ve görüntüleme/seçim (satış, masa durumu) modlarını tek yerden sağlar.
 * Veri: ev.layout = { v, w, h, grid, stage:{x,y,w,h,label}, tables:{ "<masa no>": {x,y,shape} }, labels:[{id,x,y,w,h,text}] }
 * Masa kimliği olarak masa numarası (String(m.no)) kullanılır; etkinlik içinde benzersizdir.
 */
(function () {
    'use strict';

    const SIZE = 54;              // masa çapı / kenarı
    const NS = 'http://www.w3.org/2000/svg';

    function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

    function tablesOf(ev) {
        const out = [];
        ((ev && ev.categories) || []).forEach(cat => (cat.masalar || []).forEach(m => {
            if (m && !m.isDeleted) out.push({ cat, m, key: String(m.no) });
        }));
        return out;
    }

    function newLayout() {
        return { v: 1, w: 1200, h: 800, grid: 10, template: null, stage: { x: 350, y: 24, w: 500, h: 90, label: 'SAHNE' }, tables: {}, labels: [] };
    }

    function ensureLayout(ev) {
        if (!ev.layout || typeof ev.layout !== 'object') ev.layout = newLayout();
        const L = ev.layout;
        L.tables = L.tables || {}; L.labels = L.labels || [];
        L.stage = L.stage || { x: 350, y: 24, w: 500, h: 90, label: 'SAHNE' };
        L.w = L.w || 1200; L.h = L.h || 800; L.grid = L.grid || 10;
        return L;
    }

    /* ---------------- Hazır taslaklar ---------------- */
    // Her taslak: ev.layout'u yeniden üretir. Masalar kategori sırasıyla (ilk kategori sahneye en yakın) yerleştirilir.
    function sortedTables(ev) {
        const cats = (ev.categories || []);
        const order = new Map(cats.map((c, i) => [c, i]));
        return tablesOf(ev).sort((a, b) => (order.get(a.cat) - order.get(b.cat)) || (Number(a.m.no) - Number(b.m.no)) || String(a.m.no).localeCompare(String(b.m.no), 'tr', { numeric: true }));
    }

    const TEMPLATES = {
        grid: {
            name: 'Izgara (sahne önde)',
            desc: 'Sahnenin önünde düz sıralar. Kategoriler sırayla, en önde ilk kategori.',
            build(ev, L) {
                const list = sortedTables(ev), gap = 86;
                const cols = Math.max(4, Math.floor((L.w - 80) / gap));
                L.stage = { x: Math.round(L.w / 2 - 260), y: 24, w: 520, h: 90, label: 'SAHNE' };
                const startX = (L.w - (Math.min(cols, list.length) - 1) * gap) / 2;
                list.forEach((t, i) => { L.tables[t.key] = { x: Math.round(startX + (i % cols) * gap), y: 190 + Math.floor(i / cols) * gap, shape: 'round' }; });
            }
        },
        theatre: {
            name: 'Tiyatro (ortada koridor)',
            desc: 'Sıralar ortadan koridorla ikiye ayrılır.',
            build(ev, L) {
                const list = sortedTables(ev), gap = 80, aisle = 70;
                const perSide = Math.max(2, Math.floor((L.w - 120 - aisle) / gap / 2));
                const cols = perSide * 2;
                L.stage = { x: Math.round(L.w / 2 - 240), y: 24, w: 480, h: 90, label: 'SAHNE' };
                const leftStart = L.w / 2 - aisle / 2 - (perSide - 1) * gap - gap / 2 + gap / 2;
                list.forEach((t, i) => {
                    const c = i % cols, r = Math.floor(i / cols);
                    const x = c < perSide ? (L.w / 2 - aisle / 2 - (perSide - c) * gap + gap / 2) : (L.w / 2 + aisle / 2 + (c - perSide) * gap + gap / 2);
                    L.tables[t.key] = { x: Math.round(x), y: 190 + r * gap, shape: 'round' };
                });
            }
        },
        arc: {
            name: 'Yarım daire (sahne çevresi)',
            desc: 'Sahneyi saran halkalar. İlk kategori en iç halkada.',
            build(ev, L) {
                const list = sortedTables(ev);
                const cx = L.w / 2, cy = 60;
                L.stage = { x: Math.round(cx - 170), y: 24, w: 340, h: 70, label: 'SAHNE' };
                let idx = 0, ring = 0, radius = 215;
                while (idx < list.length) {
                    const arcLen = Math.PI * radius * 0.76;            // yaklaşık yarım daire uzunluğu
                    const cap = Math.max(3, Math.floor(arcLen / 76));
                    const n = Math.min(cap, list.length - idx);
                    for (let i = 0; i < n; i++) {
                        const ang = Math.PI * 0.12 + (Math.PI * 0.76) * (n === 1 ? 0.5 : i / (n - 1));
                        const t = list[idx++];
                        L.tables[t.key] = { x: Math.round(cx + radius * Math.cos(ang)), y: Math.round(cy + radius * Math.sin(ang)), shape: 'round' };
                    }
                    ring++; radius += 84;
                }
                L.h = Math.max(800, Math.round(cy + radius + 60));
            }
        },
        arena: {
            name: 'Sahne ortada (arena)',
            desc: 'Sahne ortada, masalar çevresinde halkalar halinde.',
            build(ev, L) {
                const list = sortedTables(ev);
                const cx = L.w / 2;
                L.stage = { x: cx - 120, y: 0, w: 240, h: 110, label: 'SAHNE' };
                let idx = 0, radius = 170, cy;
                const total = list.length;
                // yüksekliği masa sayısına göre ayarla
                const rings = Math.max(1, Math.ceil(Math.sqrt(total / 6)));
                cy = 170 + rings * 90; L.stage.y = Math.round(cy - 55);
                while (idx < total) {
                    const cap = Math.max(6, Math.floor((2 * Math.PI * radius) / 76));
                    const n = Math.min(cap, total - idx);
                    for (let i = 0; i < n; i++) {
                        const ang = (2 * Math.PI * i) / n - Math.PI / 2;
                        const t = list[idx++];
                        L.tables[t.key] = { x: Math.round(cx + radius * 1.35 * Math.cos(ang)), y: Math.round(cy + radius * Math.sin(ang)), shape: 'round' };
                    }
                    radius += 84;
                }
                L.h = Math.max(800, Math.round(cy + radius + 60));
            }
        },
        ushape: {
            name: 'U düzeni (pist ortada)',
            desc: 'Masalar üç kenarda, ortası pist/boş alan.',
            build(ev, L) {
                const list = sortedTables(ev), gap = 82;
                L.stage = { x: Math.round(L.w / 2 - 230), y: 24, w: 460, h: 90, label: 'SAHNE' };
                
                const slots = [];
                const innerW = L.w - 160, rows = Math.max(4, Math.round(list.length / 6));
                for (let i = 0; i < rows && slots.length < list.length; i++) slots.push({ x: 90, y: 190 + i * gap });
                for (let i = 0; i < rows && slots.length < list.length; i++) slots.push({ x: L.w - 90, y: 190 + i * gap });
                const bottomY = 190 + rows * gap + 20;
                const cols = Math.max(4, Math.floor(innerW / gap));
                for (let i = 0; slots.length < list.length; i++) slots.push({ x: Math.round(90 + (i % cols) * (innerW / Math.max(1, cols - 1))), y: bottomY + Math.floor(i / cols) * gap });
                list.forEach((t, i) => { L.tables[t.key] = { x: Math.round(slots[i].x), y: Math.round(slots[i].y), shape: 'round' }; });
                L.labels = L.labels.filter(l => l.kind !== 'pist');
                L.labels.push({ id: 'pist', kind: 'pist', x: 200, y: 190, w: L.w - 400, h: rows * gap - 30, text: 'PİST' });
                L.h = Math.max(800, bottomY + Math.ceil(Math.max(0, list.length - 2 * rows) / cols) * gap + 90);
            }
        }
    };

    function fitHeight(L) {
        let maxY = (L.stage ? L.stage.y + L.stage.h : 0);
        Object.values(L.tables).forEach(p => { if (p.y > maxY) maxY = p.y; });
        (L.labels || []).forEach(l => { if (l.y + l.h > maxY) maxY = l.y + l.h; });
        L.h = Math.max(700, Math.round(maxY + 90));
    }

    function applyTemplate(ev, key) {
        const tpl = TEMPLATES[key];
        if (!tpl) return null;
        const L = ensureLayout(ev);
        L.tables = {};
        L.labels = (L.labels || []).filter(l => l.kind !== 'pist');
        L.w = 1200;
        tpl.build(ev, L);
        L.template = key;
        if (key !== 'arc' && key !== 'arena' && key !== 'ushape') fitHeight(L);
        return L;
    }

    // Plana yerleştirilmemiş masaları (yeni eklenenler) boş bir alana otomatik yerleştirir
    function placeMissing(ev) {
        const L = ensureLayout(ev);
        const missing = tablesOf(ev).filter(t => !L.tables[t.key]);
        if (!missing.length) return 0;
        const taken = Object.values(L.tables);
        const free = (x, y) => !taken.some(p => Math.abs(p.x - x) < 70 && Math.abs(p.y - y) < 70) && !(x > L.stage.x - 30 && x < L.stage.x + L.stage.w + 30 && y > L.stage.y - 30 && y < L.stage.y + L.stage.h + 60);
        let x = 70, y = 190;
        missing.forEach(t => {
            let guard = 0;
            while (!free(x, y) && guard++ < 4000) { x += 80; if (x > L.w - 60) { x = 70; y += 80; } }
            L.tables[t.key] = { x, y, shape: 'round' };
            taken.push(L.tables[t.key]);
        });
        fitHeight(L);
        return missing.length;
    }

    /* ---------------- Stil ---------------- */
    function injectStyle() {
        if (document.getElementById('seatmapStyle')) return;
        const st = document.createElement('style'); st.id = 'seatmapStyle';
        st.textContent = `
        .sm-wrap{position:relative;width:100%;height:100%;min-height:320px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none}
        .sm-wrap.sm-full{position:fixed;inset:0;z-index:200000;height:100%;border-radius:0}
        .sm-svg{width:100%;height:100%;display:block;cursor:grab}
        .sm-svg.dragging{cursor:grabbing}
        .sm-grid{stroke:var(--border);stroke-width:1}
        .sm-stage{fill:var(--primary-soft);stroke:var(--primary);stroke-width:2;stroke-dasharray:0}
        .sm-stage-t{fill:var(--primary-text);font:700 20px var(--font);letter-spacing:.14em;text-anchor:middle;dominant-baseline:middle;pointer-events:none}
        .sm-label{fill:var(--surface-3);stroke:var(--border-strong);stroke-width:1.5}
        .sm-label.pist{fill:transparent;stroke-dasharray:6 6}
        .sm-label-t{fill:var(--text-2);font:600 15px var(--font);text-anchor:middle;dominant-baseline:middle;pointer-events:none}
        .sm-t .body{stroke-width:3;transition:fill .15s,stroke .15s}
        .sm-t .no{font:700 17px var(--font);text-anchor:middle;dominant-baseline:central;pointer-events:none;fill:var(--text)}
        .sm-t .sub{font:600 10px var(--font);text-anchor:middle;pointer-events:none;fill:var(--muted)}
        .sm-t .seat{fill:var(--border-strong);stroke:none}
        .sm-t.selected .seat{fill:var(--primary)}
        .sm-t.free .body{fill:var(--surface)}
        .sm-t.selected .body{fill:var(--primary);stroke:var(--primary-hover)} .sm-t.selected .no,.sm-t.selected .sub{fill:#fff}
        .sm-t.sold .body{fill:var(--surface-3);stroke:var(--border-strong);stroke-dasharray:5 4} .sm-t.sold .no{fill:var(--muted)}
        .sm-t.reserved .body{fill:var(--warning-soft);stroke:var(--warning);stroke-dasharray:5 4} .sm-t.reserved .no{fill:var(--warning-text)}
        .sm-t.locked .body{stroke:var(--warning)} .sm-t.locked{opacity:.65}
        .sm-t.st-in .body{fill:var(--success-soft);stroke:var(--success)} .sm-t.st-in .no{fill:var(--success-text)}
        .sm-t.st-out .body{fill:var(--primary-soft);stroke:var(--primary)} .sm-t.st-out .no{fill:var(--primary-text)}
        .sm-t.st-wait .body{fill:var(--warning-soft);stroke:var(--warning)} .sm-t.st-wait .no{fill:var(--warning-text)}
        .sm-t.edit-sel .ring{display:block}
        .sm-t .ring{display:none;fill:none;stroke:var(--primary);stroke-width:2.5;stroke-dasharray:4 3}
        .sm-t{cursor:pointer}
        .sm-edit .sm-t,.sm-edit .sm-item{cursor:move}
        .sm-item.edit-sel .ring{display:block}
        .sm-item .ring{display:none;fill:none;stroke:var(--primary);stroke-width:2.5;stroke-dasharray:4 3}
        .sm-ctl{position:absolute;right:10px;top:10px;display:flex;flex-direction:column;gap:6px;z-index:2}
        .sm-ctl button{width:34px;height:34px;border-radius:10px;border:1px solid var(--border-strong);background:var(--surface);color:var(--text);font:600 18px var(--font);cursor:pointer;box-shadow:var(--shadow-sm)}
        .sm-ctl button:hover{background:var(--surface-3)}
        .sm-legend{position:absolute;left:10px;bottom:10px;display:flex;flex-wrap:wrap;gap:6px 12px;background:color-mix(in srgb,var(--surface) 92%,transparent);border:1px solid var(--border);border-radius:10px;padding:6px 10px;font:600 11.5px var(--font);color:var(--muted);z-index:2}
        .sm-legend i{display:inline-block;width:11px;height:11px;border-radius:50%;margin-right:5px;vertical-align:-1px;border:2px solid}
        `;
        document.head.appendChild(st);
    }

    /* ---------------- Çizim ---------------- */
    function create(container, evIn, opts) {
        opts = opts || {};
        injectStyle();
        const edit = opts.mode === 'edit';
        // Görüntüleme modunda asıl etkinlik nesnesi değiştirilmez (varsayılan yerleşim yalnızca ekranda görünür, kaydedilmez).
        const ev = edit ? evIn : Object.assign({}, evIn, { layout: JSON.parse(JSON.stringify(evIn.layout || null)) });
        const L = ensureLayout(ev);
        if (!Object.keys(L.tables).length && !opts.noAutoPlace) { applyTemplate(ev, 'grid'); if (opts.onChange) opts.onChange(L); }
        else if (placeMissing(ev) && opts.onChange) opts.onChange(L);

        container.innerHTML = '';
        const wrap = document.createElement('div'); wrap.className = 'sm-wrap' + (edit ? ' sm-edit' : ''); container.appendChild(wrap);
        const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'sm-svg'); svg.setAttribute('preserveAspectRatio', 'xMidYMid meet'); wrap.appendChild(svg);
        const ctl = document.createElement('div'); ctl.className = 'sm-ctl';
        ctl.innerHTML = '<button data-a="in" title="Yakınlaş">+</button><button data-a="out" title="Uzaklaş">−</button><button data-a="fit" title="Sığdır" style="font-size:13px">⤢</button><button data-a="full" title="Tam ekran" style="font-size:15px">⛶</button>';
        wrap.appendChild(ctl);
        if (opts.legend) {
            const lg = document.createElement('div'); lg.className = 'sm-legend';
            lg.innerHTML = opts.legend.map(([c, t]) => `<span><i style="border-color:${c[0]};background:${c[1]}"></i>${esc(t)}</span>`).join('');
            wrap.appendChild(lg);
        }

        let vb = { x: 0, y: 0, w: L.w, h: L.h };
        const selected = new Set();
        let selStage = false;

        function setVB() { svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); }
        function fit() { vb = { x: 0, y: 0, w: L.w, h: L.h }; setVB(); }
        function toSvg(cx, cy) { const p = svg.createSVGPoint(); p.x = cx; p.y = cy; const m = svg.getScreenCTM(); return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 }; }
        function zoom(f, cx, cy) {
            const c = (cx == null) ? { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 } : toSvg(cx, cy);
            const nw = Math.min(L.w * 1.2, Math.max(260, vb.w / f)), r = nw / vb.w;
            vb = { x: c.x - (c.x - vb.x) * r, y: c.y - (c.y - vb.y) * r, w: nw, h: vb.h * r }; setVB();
        }

        // Masa ölçüleri kapasiteye göre değişir (2 / 4 / 6 kişilik farklı boyda görünür)
        function dims(p, cap) {
            const shape = p.shape === 'square' ? 'square' : (p.shape === 'rect' ? 'rect' : 'round');
            if (shape === 'round') { const r = 21 + cap * 1.6; return { shape, r, w: 2 * r, h: 2 * r }; }
            if (shape === 'square') { const s = 42 + cap * 2; return { shape, r: s / 2, w: s, h: s }; }
            return { shape, r: 0, w: 46, h: 24 + cap * 10 };           // dikdörtgen: kısa kenarlar sandalye yanı, uzun kenar kapasiteyle uzar
        }
        function seatDots(d, cap) {
            let h = '';
            const dot = (x, y) => '<circle class="seat" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.4"/>';
            if (d.shape === 'round') {
                for (let i = 0; i < cap; i++) { const ang = (2 * Math.PI * i) / cap - Math.PI / 2; h += dot((d.r + 7) * Math.cos(ang), (d.r + 7) * Math.sin(ang)); }
            } else {
                const left = Math.ceil(cap / 2), right = Math.floor(cap / 2);
                for (let i = 0; i < left; i++) h += dot(-d.w / 2 - 6, -d.h / 2 + d.h * (i + 0.5) / left);
                for (let i = 0; i < right; i++) h += dot(d.w / 2 + 6, -d.h / 2 + d.h * (i + 0.5) / right);
            }
            return h;
        }

        function tableSvg(t) {
            const p = L.tables[t.key]; if (!p) return '';
            const st = opts.getState ? (opts.getState(t.cat, t.m, t.key) || {}) : {};
            const cls = ['sm-t', st.state || 'free', st.cls || '', selected.has(t.key) ? 'edit-sel' : ''].join(' ');
            const col = t.cat.color || '#4f46e5';
            const useCol = !st.state || st.state === 'free';   // durum renkleri (içeride/rezerve vb.) sınıfla gelir
            const cap = Math.max(1, Math.min(12, Number(t.m.kapasite) || 4));
            const d = dims(p, cap), rot = Number(p.r) || 0;
            const sty = useCol ? 'stroke:' + col : '';
            let body, ring;
            if (d.shape === 'round') {
                body = '<circle class="body" r="' + d.r.toFixed(1) + '" style="' + sty + '"/>';
                ring = '<circle class="ring" r="' + (d.r + 11).toFixed(1) + '"/>';
            } else {
                body = '<rect class="body" x="' + (-d.w / 2) + '" y="' + (-d.h / 2) + '" width="' + d.w + '" height="' + d.h + '" rx="' + (d.shape === 'rect' ? 8 : 10) + '" style="' + sty + '"/>';
                ring = '<rect class="ring" x="' + (-d.w / 2 - 13) + '" y="' + (-d.h / 2 - 7) + '" width="' + (d.w + 26) + '" height="' + (d.h + 14) + '" rx="14"/>';
            }
            const subY = d.shape === 'rect' ? 14 : Math.min(d.r, d.h / 2) - 8;
            const label = '<g transform="rotate(' + (-rot) + ')"><text class="no" y="' + (d.shape === 'rect' ? -4 : -2) + '">' + esc(t.m.no) + '</text><text class="sub" y="' + subY + '">' + esc(st.sub != null ? st.sub : (cap + ' kişi')) + '</text></g>';
            return '<g class="' + cls + '" data-k="' + esc(t.key) + '" transform="translate(' + p.x + ' ' + p.y + ') rotate(' + rot + ')">' + ring + '<g class="seats">' + seatDots(d, cap) + '</g>' + body + label + '<title>' + esc(st.title || ('Masa ' + t.m.no + ' · ' + t.cat.name + ' · ' + cap + ' kişilik')) + '</title></g>';
        }

        function render() {
            let h = '';
            // ızgara (düzenleyicide)
            if (edit) {
                const g = 50;
                for (let x = 0; x <= L.w; x += g) h += `<line class="sm-grid" x1="${x}" y1="0" x2="${x}" y2="${L.h}"/>`;
                for (let y = 0; y <= L.h; y += g) h += `<line class="sm-grid" x1="0" y1="${y}" x2="${L.w}" y2="${y}"/>`;
            }
            h += `<rect x="0" y="0" width="${L.w}" height="${L.h}" fill="transparent" data-bg="1"/>`;
            // etiketler / alanlar
            (L.labels || []).forEach(l => {
                h += `<g class="sm-item${selected.has('L:' + l.id) ? ' edit-sel' : ''}" data-k="L:${esc(l.id)}"><rect class="sm-label ${l.kind === 'pist' ? 'pist' : ''}" x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="12"/><rect class="ring" x="${l.x - 5}" y="${l.y - 5}" width="${l.w + 10}" height="${l.h + 10}" rx="16"/><text class="sm-label-t" x="${l.x + l.w / 2}" y="${l.y + l.h / 2}">${esc(l.text)}</text></g>`;
            });
            // sahne
            const S = L.stage;
            h += `<g class="sm-item${selStage ? ' edit-sel' : ''}" data-k="STAGE"><rect class="sm-stage" x="${S.x}" y="${S.y}" width="${S.w}" height="${S.h}" rx="16"/><rect class="ring" x="${S.x - 6}" y="${S.y - 6}" width="${S.w + 12}" height="${S.h + 12}" rx="20"/><text class="sm-stage-t" x="${S.x + S.w / 2}" y="${S.y + S.h / 2}">${esc(S.label || 'SAHNE')}</text></g>`;
            tablesOf(ev).forEach(t => { h += tableSvg(t); });
            svg.innerHTML = h;
        }

        /* --- etkileşim --- */
        const pointers = new Map();
        let drag = null, pinch = null, moved = 0;

        function keyOf(el) { const g = el.closest && el.closest('[data-k]'); return g ? g.getAttribute('data-k') : null; }
        function itemPos(k) {
            if (k === 'STAGE') return L.stage;
            if (k.startsWith('L:')) return (L.labels || []).find(l => 'L:' + l.id === k);
            return L.tables[k];
        }
        function notifySel() { if (opts.onSelect) opts.onSelect({ tables: [...selected].filter(k => !k.startsWith('L:')), labels: [...selected].filter(k => k.startsWith('L:')).map(k => k.slice(2)), stage: selStage }); }

        svg.addEventListener('pointerdown', (e) => {
            svg.setPointerCapture && svg.setPointerCapture(e.pointerId);
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            moved = 0;
            if (pointers.size === 2) {
                const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; drag = null; return;
            }
            const k = keyOf(e.target);
            if (edit && k) {
                if (k === 'STAGE') { if (!e.shiftKey) { selected.clear(); } selStage = true; }
                else { selStage = e.shiftKey ? selStage : false; if (!e.shiftKey && !selected.has(k)) selected.clear(); if (e.shiftKey && selected.has(k)) selected.delete(k); else selected.add(k); }
                const start = toSvg(e.clientX, e.clientY);
                drag = { type: 'items', start, orig: new Map(), k };
                [...selected].forEach(id => { const p = itemPos(id); if (p) drag.orig.set(id, { x: p.x, y: p.y }); });
                if (selStage) drag.orig.set('STAGE', { x: L.stage.x, y: L.stage.y });
                render(); notifySel();
            } else {
                drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vb: { ...vb }, k };
                svg.classList.add('dragging');
            }
        });
        svg.addEventListener('pointermove', (e) => {
            if (!pointers.has(e.pointerId)) return;
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pinch && pointers.size === 2) {
                const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
                if (pinch.d) { zoom(d / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2); } pinch.d = d; moved = 99; return;
            }
            if (!drag) return;
            if (drag.type === 'pan') {
                const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy; moved = Math.max(moved, Math.hypot(dx, dy));
                const m = svg.getScreenCTM(); const sc = m ? m.a : 1;
                vb = { x: drag.vb.x - dx / sc, y: drag.vb.y - dy / sc, w: drag.vb.w, h: drag.vb.h }; setVB();
            } else if (drag.type === 'items') {
                const cur = toSvg(e.clientX, e.clientY); const dx = cur.x - drag.start.x, dy = cur.y - drag.start.y;
                moved = Math.max(moved, Math.hypot(dx, dy));
                if (moved < 3) return;
                const g = L.grid || 10;
                drag.orig.forEach((o, id) => {
                    const p = itemPos(id); if (!p) return;
                    p.x = Math.round((o.x + dx) / g) * g; p.y = Math.round((o.y + dy) / g) * g;
                });
                render();
            }
        });
        function end(e) {
            pointers.delete(e.pointerId);
            svg.classList.remove('dragging');
            if (pointers.size < 2) pinch = null;
            if (!drag) return;
            const d = drag; drag = null;
            if (d.type === 'items') { if (moved >= 3) { fitHeightIfNeeded(); if (opts.onChange) opts.onChange(L); } }
            else if (d.type === 'pan') {
                if (moved < 6) {
                    const k = d.k;
                    if (edit) { selected.clear(); selStage = false; render(); notifySel(); }
                    else if (k && !k.startsWith('L:') && k !== 'STAGE' && opts.onTap) {
                        const t = tablesOf(ev).find(x => x.key === k); if (t) opts.onTap(t.cat, t.m, t.key);
                    }
                }
            }
        }
        function fitHeightIfNeeded() {
            let maxY = 0; Object.values(L.tables).forEach(p => { if (p.y > maxY) maxY = p.y; });
            (L.labels || []).forEach(l => { if (l.y + l.h > maxY) maxY = l.y + l.h; });
            if (maxY + 70 > L.h) { L.h = Math.round(maxY + 90); fit(); }
        }
        svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
        svg.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); }, { passive: false });
        ctl.addEventListener('click', (e) => { const a = e.target.getAttribute && e.target.getAttribute('data-a'); if (a === 'in') zoom(1.3); else if (a === 'out') zoom(1 / 1.3); else if (a === 'fit') fit(); else if (a === 'full') { const on = wrap.classList.toggle('sm-full'); document.body.style.overflow = on ? 'hidden' : ''; setTimeout(fit, 60); } });
        if (edit) {
            window.addEventListener('keydown', onKey);
        }
        function onKey(e) {
            if (!selected.size && !selStage) return;
            if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;
            const step = e.shiftKey ? 50 : (L.grid || 10);
            const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
            if (mv) {
                e.preventDefault();
                [...selected].forEach(id => { const p = itemPos(id); if (p) { p.x += mv[0]; p.y += mv[1]; } });
                if (selStage) { L.stage.x += mv[0]; L.stage.y += mv[1]; }
                render(); if (opts.onChange) opts.onChange(L);
            } else if (e.key === 'r' || e.key === 'R') {
                const dr = e.key === 'R' ? -15 : 15; [...selected].forEach(id => { const p = L.tables[id]; if (p) p.r = (((Number(p.r) || 0) + dr) % 360 + 360) % 360; });
                render(); if (opts.onChange) opts.onChange(L);
            } else if (e.key === 'Delete' || e.key === 'Backspace') { if (opts.onDelete) opts.onDelete(ctrl.getSelection()); }
        }

        render(); fit();

        const ctrl = {
            refresh() { render(); },
            fit, zoom,
            relayout() { render(); fit(); },
            getSelection() { return { tables: [...selected].filter(k => !k.startsWith('L:')), labels: [...selected].filter(k => k.startsWith('L:')).map(k => k.slice(2)), stage: selStage }; },
            select(keys, stage) { selected.clear(); (keys || []).forEach(k => selected.add(k)); selStage = !!stage; render(); notifySel(); },
            destroy() { window.removeEventListener('keydown', onKey); container.innerHTML = ''; }
        };
        return ctrl;
    }

    window.SeatMap = { create, ensureLayout, applyTemplate, placeMissing, templates: TEMPLATES, tablesOf, SIZE };
})();
