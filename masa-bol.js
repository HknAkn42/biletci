/**
 * BiletPro | Masa bölme / birleştirme (saf mantık, ekran yok)
 * Kural: ana masa numarasını korur (125); yeni parçalar sırayla A, B, C... alır (125-A, 125-B).
 * Parça masası = normal masa + { parentNo: <kök masa no>, splitFrom: <bölündüğü masanın id'si>, suffix: 'A' }.
 * Satılmış masada kalan kişi sayısı, satılan kişi sayısının altına inemez. Fiyat kategoriden gelir (burada hesaplanmaz).
 */
(function (root) {
    'use strict';

    var SIZE = 54;

    function isPart(m) { return !!m && m.parentNo !== undefined && m.parentNo !== null; }
    function rootNo(m) { return isPart(m) ? m.parentNo : m.no; }
    function cmpNo(a, b) { return String(a).localeCompare(String(b), 'tr', { numeric: true }); }
    function soldPeople(m) { return m && m.isSold ? (Number(m.saleDetail && m.saleDetail.people) || 0) : 0; }
    function freeSeats(m) { return Math.max(0, (Number(m.kapasite) || 0) - soldPeople(m)); }

    function eachMasa(ev, fn) {
        ((ev && ev.categories) || []).forEach(function (cat) { (cat.masalar || []).forEach(function (m) { fn(m, cat); }); });
    }
    function find(ev, masaId) {
        var out = null;
        eachMasa(ev, function (m, cat) { if (!out && m.id === masaId) out = { m: m, cat: cat }; });
        return out;
    }

    function suffixName(i) { // 0 -> A ... 25 -> Z, 26 -> AA
        var s = '';
        i = i + 1;
        while (i > 0) { var r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
        return s;
    }
    function nextSuffixes(ev, rNo, count) {
        var used = {};
        eachMasa(ev, function (m) { if (isPart(m) && !m.isDeleted && String(m.parentNo) === String(rNo)) used[m.suffix] = true; });
        var out = [], i = 0;
        while (out.length < count) { var s = suffixName(i++); if (!used[s]) out.push(s); }
        return out;
    }

    function newId(ev) {
        var taken = {};
        eachMasa(ev, function (m) { taken[m.id] = true; });
        var id;
        do { id = Date.now() * 1000 + Math.floor(Math.random() * 1000); } while (taken[id]);
        return id;
    }

    function intArr(sizes) { return (sizes || []).map(function (n) { return Math.floor(Number(n)); }); }

    /** Bölme önizleme/doğrulama: sizes = YENİ parçaların kişi sayıları. */
    function checkSplit(ev, masaId, sizes) {
        var f = find(ev, masaId);
        if (!f) return { ok: false, error: 'Masa bulunamadı.' };
        var m = f.m;
        if (m.isDeleted) return { ok: false, error: 'Pasif masa bölünemez.' };
        sizes = intArr(sizes);
        if (!sizes.length) return { ok: false, error: 'En az bir yeni parça girin.' };
        if (sizes.some(function (n) { return !(n >= 1); })) return { ok: false, error: 'Her parça en az 1 kişi olmalı.' };
        var cap = Number(m.kapasite) || 0;
        var sum = sizes.reduce(function (a, b) { return a + b; }, 0);
        var keep = cap - sum;
        var minKeep = Math.max(1, soldPeople(m));
        if (keep < minKeep) {
            if (m.isSold && soldPeople(m) >= cap) return { ok: false, error: 'Bu masa tam dolu satılmış (' + soldPeople(m) + ' kişi). Önce satışı düzenleyip kişi sayısını düşürün.' };
            return { ok: false, error: 'Bu masada en az ' + minKeep + ' kişi kalmalı (en fazla ' + Math.max(0, cap - minKeep) + ' kişilik yeni parça ayrılabilir).' };
        }
        return { ok: true, keep: keep, sizes: sizes, suffixes: nextSuffixes(ev, rootNo(m), sizes.length), rootNo: rootNo(m) };
    }

    function placeNear(ev, fromKey, newKey) {
        var L = ev && ev.layout;
        if (!L || !L.tables || !L.tables[fromKey]) return;
        var p = L.tables[fromKey], minD = SIZE * 0.95, W = L.w || 1200, H = L.h || 800;
        function free(x, y) {
            return Object.keys(L.tables).every(function (k) { var q = L.tables[k]; return Math.abs(q.x - x) >= minD || Math.abs(q.y - y) >= minD; });
        }
        var cands = [];
        for (var dx = -300; dx <= 300; dx += 10) for (var dy = -300; dy <= 300; dy += 10) {
            if (!dx && !dy) continue;
            // yan yana (aynı sıra) yerleşim tercih edilir: yatay uzaklık dikeyden ucuz
            cands.push({ dx: dx, dy: dy, d: Math.sqrt(dx * dx + dy * dy * 1.6) + (dx > 0 ? 0 : 4) });
        }
        cands.sort(function (a, b) { return a.d - b.d; });
        var chosen = null;
        for (var i = 0; i < cands.length && !chosen; i++) {
            var x = p.x + cands[i].dx, y = p.y + cands[i].dy;
            if (x > 30 && y > 130 && x < W - 30 && y < H - 30 && free(x, y)) chosen = { x: x, y: y };
        }
        if (!chosen) { // yer yoksa en alt sıranın altına
            var maxY = 0; Object.keys(L.tables).forEach(function (k) { maxY = Math.max(maxY, L.tables[k].y); });
            chosen = { x: p.x, y: maxY + SIZE + 20 }; L.h = Math.max(H, chosen.y + 80);
        }
        L.tables[newKey] = { x: Math.round(chosen.x), y: Math.round(chosen.y), shape: p.shape || 'round' };
    }

    /** Böl: ana masanın kapasitesini düşürür, aynı kategoride yeni parçalar açar. */
    function split(ev, masaId, sizes) {
        var chk = checkSplit(ev, masaId, sizes);
        if (!chk.ok) return chk;
        var f = find(ev, masaId), m = f.m, cat = f.cat;
        var oldCap = Number(m.kapasite) || 0;
        m.kapasite = chk.keep;
        var created = [];
        var at = cat.masalar.indexOf(m) + 1;
        chk.sizes.forEach(function (n, i) {
            var suffix = chk.suffixes[i];
            var p = { id: newId(ev), no: chk.rootNo + '-' + suffix, kapasite: n, isSold: false, isDeleted: false, parentNo: chk.rootNo, suffix: suffix, splitFrom: m.id };
            cat.masalar.splice(at++, 0, p);
            created.push(p);
            placeNear(ev, String(m.no), String(p.no));
        });
        return { ok: true, parent: m, created: created, oldCap: oldCap, cat: cat };
    }

    /** Birleştirme kontrolü. busy(m) -> true ise (rezerve / başka kasada satılmış) birleştirilemez. */
    function checkMerge(ev, partId, busy) {
        var f = find(ev, partId);
        if (!f) return { ok: false, error: 'Masa bulunamadı.' };
        var p = f.m;
        if (p.isDeleted) return { ok: false, error: 'Bu parça zaten birleştirilmiş.' };
        if (!isPart(p)) return { ok: false, error: 'Bu masa bir parça değil (yalnızca A, B... parçaları birleştirilir).' };
        if (p.isSold) return { ok: false, error: 'Satılmış parça birleştirilemez. Önce satışı iptal edin.' };
        if (busy && busy(p)) return { ok: false, error: 'Bu parça rezerve ya da başka kasada satılmış; birleştirilemez.' };
        var t = find(ev, p.splitFrom);
        if (!t || t.m.isDeleted || t.cat !== f.cat) {
            var rootM = null;
            f.cat.masalar.forEach(function (x) { if (!rootM && !isPart(x) && String(x.no) === String(p.parentNo) && !x.isDeleted) rootM = x; });
            if (!rootM) return { ok: false, error: 'Birleştirilecek ana masa bulunamadı.' };
            t = { m: rootM, cat: f.cat };
        }
        return { ok: true, part: p, target: t.m, cat: f.cat };
    }

    function merge(ev, partId, busy) {
        var c = checkMerge(ev, partId, busy);
        if (!c.ok) return c;
        c.target.kapasite = (Number(c.target.kapasite) || 0) + (Number(c.part.kapasite) || 0);
        // Silinmez, pasife alınıp işaretlenir: sunucu senkronunda (id bazlı birleştirme) geri dirilmesin.
        c.part.isDeleted = true; c.part.mergedInto = c.target.id;
        if (ev.layout && ev.layout.tables) delete ev.layout.tables[String(c.part.no)];
        return { ok: true, target: c.target, removed: c.part };
    }

    /** Kısmen satılmış (boş koltuğu olan) masa sayısı / boş koltuk toplamı. */
    function partialStats(ev) {
        var tables = 0, seats = 0;
        eachMasa(ev, function (m) { if (!m.isDeleted && m.isSold && freeSeats(m) > 0) { tables++; seats += freeSeats(m); } });
        return { tables: tables, seats: seats };
    }

    var api = { isPart: isPart, rootNo: rootNo, cmpNo: cmpNo, soldPeople: soldPeople, freeSeats: freeSeats, checkSplit: checkSplit, split: split, checkMerge: checkMerge, merge: merge, partialStats: partialStats, placeNear: placeNear, find: find };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.MasaBol = api;
})(typeof window !== 'undefined' ? window : globalThis);
