/* BiletPro giriş ekranı: sade sahne ışıkları + gişe sahnesi.
   Kapıda QR okutan görevli, ellerinde bilet tutan misafirler: onaylı giriş, ödeme bekleyen (tahsilat), zaten içeride olan (geri çevrilir).
   Doğru şifreden sonra veriler yüklenene kadar sahne sürer; son misafir (sen) içeri girince panel açılır. Tıklama/tuş ile atlanır. Dış kütüphane yok. */
(function () {
    'use strict';
    var reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}
    var bg = document.getElementById('fxCanvas'), bctx = bg && bg.getContext ? bg.getContext('2d') : null;
    var sc = document.getElementById('fxSceneCv'), sctx = sc && sc.getContext ? sc.getContext('2d') : null;
    var W = 0, H = 0, dpr = 1, energy = .1, last = 0, t = 0;
    var dots = [], sparks = [];
    var beams = [
        { x: .18, c: '99,102,241', ph: 0.0, sp: .30 }, { x: .50, c: '59,130,246', ph: 2.0, sp: .24 },
        { x: .82, c: '148,163,184', ph: 4.0, sp: .34 }, { x: .34, c: '129,140,248', ph: 1.1, sp: .20 }
    ];
    var rnd = function (a, b) { return a + Math.random() * (b - a); };
    var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
    var ease = function (u) { return u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; };

    function resize() {
        dpr = Math.min(2, window.devicePixelRatio || 1);
        W = window.innerWidth; H = window.innerHeight;
        if (bg) { bg.width = W; bg.height = H; }
        if (sc) { sc.width = Math.round(W * dpr); sc.height = Math.round(H * dpr); }
        if (bctx) bctx.setTransform(1, 0, 0, 1, 0, 0);
        if (sctx) sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        var n = W < 640 ? 18 : 34; dots = [];
        for (var i = 0; i < n; i++) dots.push({ x: rnd(0, W), y: rnd(0, H), r: rnd(3, 10), vy: rnd(5, 16), vx: rnd(-5, 5), ph: rnd(0, 6.28), c: i % 3 ? '147,197,253' : '199,210,254' });
    }

    /* ---------------- çubuk adam ---------------- */
    // poz: [kalçaYüksekliği, gövdeEğimi, önKolÜst, önKolAlt, arkaKolÜst, arkaKolAlt, önBacakÜst, önBacakAlt, arkaBacakÜst, arkaBacakAlt]
    var P = {
        STAND: [33, 0, .15, .2, -.1, .2, .1, 0, -.1, 0],
        HOLD: [32, .08, 1.45, .15, .3, .4, .15, 0, -.15, 0],      // bileti öne uzatır
        SCAN: [32, .05, 1.5, 0, .5, .8, .15, 0, -.15, 0],         // okuyucuyu uzatır
        NO: [33, 0, .3, .3, -.2, .2, .1, 0, -.1, 0],
        SHRUG: [33, 0, 2.0, 1.0, 1.8, 1.1, .1, 0, -.1, 0],        // omuz silker
        CHEER: [33, -.05, 2.8, .2, 2.6, .2, .12, 0, -.12, 0],     // el sallar / sevinir
        BOW: [30, .55, .4, .5, .2, .5, .2, -.1, -.2, .1],
        CROSS: [33, 0, 1.0, 1.9, 1.0, 1.9, .1, 0, -.1, 0]         // kollar kavuşuk (hayır)
    };
    function mix(a, b, u) { var o = []; for (var i = 0; i < a.length; i++) o.push(a[i] + (b[i] - a[i]) * u); return o; }
    function walkPose(ph, lean) {
        var s = Math.sin(ph), c = Math.cos(ph);
        return [32 + Math.abs(c) * 1.2, lean || .08, .1 + s * .7, .35, .1 - s * .7, .35, s * .65, -Math.max(0, -c) * .8 - .05, -s * .65, -Math.max(0, c) * .8 - .05];
    }
    // dir: +1 sağa, -1 sola bakar. weapon: 'ticket' | 'ticketgold' | 'scanner' | 'coin' (ön elde). Dönüş: elin konumu.
    function figure(ctx, pose, dir, col, lw, a, weapon, wcol) {
        var hh = pose[0], tor = pose[1], d = dir, hx = 0, hy = -hh;
        var lim = function (x, y, len, ang) { return [x + Math.sin(ang) * len * d, y + Math.cos(ang) * len]; };
        var shx = hx + Math.sin(tor) * 24 * d, shy = hy - Math.cos(tor) * 24;
        var cx = shx + Math.sin(tor) * 10.5 * d, cy = shy - Math.cos(tor) * 10.5;
        var out = null;
        function limb(x0, y0, l1, a1, l2, a2, alpha, wp) {
            var m = lim(x0, y0, l1, a1), e = lim(m[0], m[1], l2, a1 + a2);
            ctx.globalAlpha = a * alpha; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(m[0], m[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
            if (wp) { var fa = a1 + a2; out = { hx: e[0], hy: e[1], vx: Math.sin(fa) * d, vy: Math.cos(fa) }; }
        }
        ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        limb(hx, hy, 17, pose[8], 17, pose[9], .7);
        limb(shx, shy, 13, pose[4], 12, pose[5], .7);
        ctx.globalAlpha = a; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(shx, shy); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, 7, 0, 6.283); ctx.stroke();
        limb(hx, hy, 17, pose[6], 17, pose[7], 1);
        limb(shx, shy, 13, pose[2], 12, pose[3], 1, true);
        if (weapon && out) {
            ctx.save(); ctx.globalAlpha = a; ctx.translate(out.hx, out.hy); ctx.rotate(Math.atan2(out.vy, out.vx));
            if (weapon === 'ticket' || weapon === 'ticketgold') {
                ctx.fillStyle = weapon === 'ticketgold' ? '#fcd34d' : '#f8fafc'; ctx.fillRect(0, -5, 14, 10);
                ctx.fillStyle = '#0f172a'; [[2, -3], [5, -3], [8, -3], [2, 0], [8, 0], [5, 2], [11, 2], [11, -3]].forEach(function (q) { ctx.fillRect(q[0], q[1], 2, 2); });
            } else if (weapon === 'scanner') {
                ctx.fillStyle = '#0b1220'; ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.2; ctx.fillRect(0, -4.5, 11, 9); ctx.strokeRect(0, -4.5, 11, 9);
                ctx.fillStyle = wcol || '#38bdf8'; ctx.fillRect(7.5, -2.5, 2.6, 2.6);
            } else if (weapon === 'coin') {
                ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(5, 0, 4, 0, 6.283); ctx.fill();
            }
            ctx.restore();
        }
        ctx.globalAlpha = 1;
        return out;
    }

    /* ---------------- gişe sahnesi ---------------- */
    var SP = 1.35;                                   // sahne hız çarpanı
    var scene = { clock: 0, guests: [], frontFree: 0, nextSpawn: .6, count: 7, finalSpawned: false, wantFinal: false, ready: false, doneCb: null, finished: false, armed: 0, deny: 0, flashes: [], coins: [], open: 0, simple: false, fin: 0 };
    var TINTS = ['#94a3b8', '#a5b4fc', '#93c5fd', '#cbd5e1', '#c4b5fd'];

    function geom() {
        var el = document.getElementById('fxScene'); if (!el) return null;
        var r = el.getBoundingClientRect(); if (r.width < 40) return null;
        var doorX = r.left + r.width * .88;
        return { x: r.left, y: r.top, w: r.width, h: r.height, ground: r.top + r.height - 12, doorX: doorX, attX: doorX - 56, frontX: doorX - 56 - 46, startX: r.left + 10 };
    }

    // Bir misafirin zaman çizelgesini kurar. type: ok | debt | used | final
    function spawnGuest(type, g) {
        var now = scene.clock, arrive = now + (type === 'final' ? 1.2 : 1.7);
        var ahead = 0; scene.guests.forEach(function (o) { if (o.lf > arrive) ahead++; });
        var spot = Math.min(ahead, 3), spotX = g.frontX - 36 * spot;
        var c = Math.max(arrive + (spot ? .2 : .3), scene.frontFree);
        var gu = { type: type, c: c, ts: now, color: type === 'final' ? '#fcd34d' : TINTS[(Math.random() * TINTS.length) | 0], gold: type === 'final', path: [], res: null, admitted: false, left: false };
        var p = gu.path; p.push([now, g.startX], [arrive, spotX], [c, spotX], [c + .45, g.frontX]);
        if (type === 'ok' || type === 'final') {
            gu.res = [{ t: c + 1.2, ok: true, text: 'GİRİŞ ONAYLI' }]; gu.hold = [c + .45, c + 1.5]; gu.scan = [[c + .7, c + 1.2]];
            gu.lf = c + 1.7; gu.passAt = c + 1.5; p.push([c + 1.5, g.frontX], [c + 2.6, g.doorX - 4]); gu.admitAt = c + 2.5; gu.end = c + 2.7;
        } else if (type === 'debt') {
            gu.res = [{ t: c + 1.2, ok: false, text: 'ÖDEME BEKLİYOR' }, { t: c + 2.4, ok: true, text: 'GİRİŞ ONAYLI' }]; gu.hold = [c + .45, c + 2.5]; gu.scan = [[c + .7, c + 1.2], [c + 2.1, c + 2.4]];
            gu.coin = [c + 1.5, c + 1.95]; gu.lf = c + 2.9; gu.passAt = c + 2.7; p.push([c + 2.7, g.frontX], [c + 3.8, g.doorX - 4]); gu.admitAt = c + 3.7; gu.end = c + 3.9;
        } else {   // used: zaten içeride, geri çevrilir
            gu.res = [{ t: c + 1.2, ok: false, text: 'ZATEN İÇERİDE' }]; gu.hold = [c + .45, c + 1.5]; gu.scan = [[c + .7, c + 1.2]];
            gu.shrug = [c + 1.5, c + 2.0]; gu.lf = c + 2.2; gu.leaveAt = c + 2.0; p.push([c + 2.0, g.frontX], [c + 3.6, g.startX]); gu.admitAt = null; gu.end = c + 3.7;
        }
        scene.frontFree = gu.lf; scene.guests.push(gu); return gu;
    }
    // Son misafir (sen): giriş yapınca hemen kuyruğa girip bekler; veriler hazır olunca okutup içeri girer
    function spawnFinalWaiting(g) {
        var now = scene.clock, ahead = 0; scene.guests.forEach(function (o) { if (!o.fade && o.lf > now + 1.2) ahead++; });
        var spotX = g.frontX - 36 * Math.max(1, Math.min(ahead, 2));
        var gu = { type: 'final', c: 1e9, lf: 1e9, end: 1e9, ts: now, color: '#fcd34d', gold: true, path: [[now, g.startX], [now + 1.2, spotX]], spotX: spotX, res: [], hold: null, scan: [], waiting: true, admitted: false, admitAt: null };
        scene.guests.push(gu); return gu;
    }
    function startFinal(gu, g) {
        var c = Math.max(scene.clock + .1, scene.frontFree), p = gu.path;
        gu.waiting = false; gu.c = c; p.push([c, gu.spotX], [c + .4, g.frontX]);
        gu.res = [{ t: c + .95, ok: true, text: 'GİRİŞ ONAYLI' }]; gu.hold = [c + .4, c + 1.2]; gu.scan = [[c + .55, c + .95]];
        gu.lf = c + 1.35; gu.passAt = c + 1.2; p.push([c + 1.2, g.frontX], [c + 2.0, g.doorX - 4]); gu.admitAt = c + 1.95; gu.end = c + 2.2;
        scene.frontFree = gu.lf;
    }
    function pathX(path, tt) {
        if (tt <= path[0][0]) return path[0][1];
        for (var i = 1; i < path.length; i++) if (tt <= path[i][0]) { var a = path[i - 1], b = path[i]; return a[1] + (b[1] - a[1]) * ease(clamp((tt - a[0]) / Math.max(1e-4, b[0] - a[0]), 0, 1)); }
        return path[path.length - 1][1];
    }
    function pill(x, y, text, color, al, sc2) {
        sctx.save(); sctx.translate(x, y); sctx.scale(sc2, sc2); sctx.globalAlpha = al;
        sctx.font = '800 10.5px Inter, Arial, sans-serif'; var tw = sctx.measureText(text).width + 22;
        sctx.fillStyle = 'rgba(8,12,28,.92)'; sctx.strokeStyle = color; sctx.lineWidth = 1.4;
        sctx.beginPath(); if (sctx.roundRect) sctx.roundRect(-tw / 2, -10, tw, 20, 10); else sctx.rect(-tw / 2, -10, tw, 20); sctx.fill(); sctx.stroke();
        sctx.fillStyle = color; sctx.textAlign = 'center'; sctx.textBaseline = 'middle'; sctx.fillText(text, 0, .5); sctx.restore();
    }

    function drawDoor(g, open, glow) {
        var x = g.doorX, gy = g.ground, w = 36, h = 66;
        sctx.save();
        if (glow > .02) {
            var lg = sctx.createLinearGradient(x - w / 2, 0, x - w / 2 - 150, 0);
            lg.addColorStop(0, 'rgba(255,240,205,' + (.3 * glow) + ')'); lg.addColorStop(1, 'rgba(255,240,205,0)');
            sctx.fillStyle = lg; sctx.beginPath(); sctx.moveTo(x - w / 2, gy - h * .35 * open); sctx.lineTo(x - w / 2 - 150, gy - 6); sctx.lineTo(x - w / 2 - 150, gy + 2); sctx.lineTo(x - w / 2, gy + 2); sctx.closePath(); sctx.fill();
        }
        sctx.fillStyle = 'rgba(10,14,30,.92)'; sctx.strokeStyle = 'rgba(148,163,184,.75)'; sctx.lineWidth = 2.2;
        sctx.beginPath(); sctx.rect(x - w / 2, gy - h, w, h); sctx.fill(); sctx.stroke();
        var ig = sctx.createLinearGradient(0, gy - h, 0, gy);
        ig.addColorStop(0, 'rgba(255,244,214,' + (.12 + .8 * glow) + ')'); ig.addColorStop(1, 'rgba(255,225,170,' + (.16 + .75 * glow) + ')');
        sctx.fillStyle = ig; sctx.fillRect(x - w / 2 + 2, gy - h + 2, w - 4, h - 3);
        var lw2 = (w - 4) * (1 - open * .88);
        sctx.fillStyle = 'rgba(51,65,85,.98)'; sctx.strokeStyle = 'rgba(148,163,184,.8)'; sctx.lineWidth = 1.4;
        sctx.beginPath(); sctx.moveTo(x + w / 2 - 2, gy - h + 2); sctx.lineTo(x + w / 2 - 2 - lw2, gy - h + 2 + open * 4); sctx.lineTo(x + w / 2 - 2 - lw2, gy - 2 - open * 4); sctx.lineTo(x + w / 2 - 2, gy - 2); sctx.closePath(); sctx.fill(); sctx.stroke();
        // üstteki tabela: içerideki kişi sayısı
        sctx.fillStyle = 'rgba(8,12,28,.9)'; sctx.strokeStyle = 'rgba(148,163,184,.6)'; sctx.lineWidth = 1;
        sctx.fillRect(x - 22, gy - h - 17, 44, 13); sctx.strokeRect(x - 22, gy - h - 17, 44, 13);
        sctx.fillStyle = '#86efac'; sctx.font = '700 8.5px Inter, Arial, sans-serif'; sctx.textAlign = 'center'; sctx.textBaseline = 'middle'; sctx.fillText('İÇERİDE ' + scene.count, x, gy - h - 10.5);
        sctx.restore();
    }

    function drawScene(dt) {
        if (!sctx) return;
        sctx.clearRect(0, 0, W, H);
        var g = geom(); if (!g) return;
        scene.clock += dt * SP; var clk = scene.clock;
        // zemin
        var fl = sctx.createLinearGradient(g.x, 0, g.x + g.w, 0);
        fl.addColorStop(0, 'rgba(148,163,184,0)'); fl.addColorStop(.2, 'rgba(148,163,184,.35)'); fl.addColorStop(.8, 'rgba(148,163,184,.35)'); fl.addColorStop(1, 'rgba(148,163,184,0)');
        sctx.strokeStyle = fl; sctx.lineWidth = 1.5; sctx.beginPath(); sctx.moveTo(g.x, g.ground + 1); sctx.lineTo(g.x + g.w, g.ground + 1); sctx.stroke();

        // yeni misafirler
        if (scene.wantFinal && !scene.finalSpawned) {
            scene.guests.forEach(function (o) { if (o.c > clk + .2 && !o.waiting) { o.fade = clk; o.end = clk + .45; } });
            scene.frontFree = 0; scene.guests.forEach(function (o) { if (!o.fade && o.lf < 1e8 && o.lf > scene.frontFree) scene.frontFree = o.lf; });
            scene.fin = spawnFinalWaiting(g); scene.finalSpawned = true;
        }
        if (scene.fin && scene.fin.waiting && scene.ready && clk >= scene.fin.path[1][0]) startFinal(scene.fin, g);
        if (!scene.finalSpawned) {
            if (false) {
                // sıradakiler silinir (solar); son misafir (sen) hemen yaklaşır
                scene.guests.forEach(function (o) { if (o.c > clk + .2) { o.fade = clk; o.end = clk + .45; } });
                scene.frontFree = 0; scene.guests.forEach(function (o) { if (!o.fade && o.lf > scene.frontFree) scene.frontFree = o.lf; });
                var fg = spawnGuest('final', g); scene.finalSpawned = true; scene.fin = fg; }
            else if (clk >= scene.nextSpawn && scene.guests.filter(function (o) { return o.end > clk; }).length < 3) {
                var r = Math.random(), tp = r < .5 ? 'ok' : r < .75 ? 'debt' : 'used';
                spawnGuest(tp, g); scene.nextSpawn = clk + rnd(1.0, 1.8);
            }
        }
        // misafirleri çiz
        var openT = 0, front = null, guestOuts = [];
        for (var i = scene.guests.length - 1; i >= 0; i--) {
            var gu = scene.guests[i];
            if (clk > gu.end + .3) { scene.guests.splice(i, 1); continue; }
            var x = pathX(gu.path, clk), x2 = pathX(gu.path, clk + .08), moving = Math.abs(x2 - x) > .12, dir = (x2 - x) >= 0 || !moving ? 1 : -1;
            if (gu.type === 'used' && clk > gu.leaveAt) dir = -1;
            var al = clamp((clk - gu.ts) / .3, 0, 1); if (gu.fade) al = Math.min(al, clamp(1 - (clk - gu.fade) / .4, 0, 1));
            if (gu.admitAt && x > g.doorX - 30) al = Math.min(al, clamp((g.doorX - 2 - x) / 28, 0, 1));
            if (gu.type === 'used' && clk > gu.leaveAt + .9) al = Math.min(al, clamp(1 - (clk - gu.leaveAt - .9) / .7, 0, 1));
            if (x > g.doorX - 90 && al > .05 && gu.admitAt) openT = 1;
            if (gu.admitAt && clk >= gu.admitAt && !gu.admitted) { gu.admitted = true; scene.count++; if (gu.type === 'final') { scene.fin = gu; scene.finDone = clk; } }
            var pose, weapon = null, hold = gu.hold && clk >= gu.hold[0] && clk <= gu.hold[1] && Math.abs(x - g.frontX) < 2 && !(gu.coin && clk >= gu.coin[0] && clk <= gu.coin[1]);
            if (gu.coin && clk >= gu.coin[0] && clk <= gu.coin[1]) { pose = P.HOLD; weapon = 'coin'; }
            else if (hold) { pose = P.HOLD; weapon = gu.gold ? 'ticketgold' : 'ticket'; }
            else if (gu.shrug && clk >= gu.shrug[0] && clk <= gu.shrug[1]) pose = P.SHRUG;
            else if (moving) pose = walkPose(clk * 9 + i * 1.7, .08);
            else pose = mix(P.STAND, P.STAND, 0);
            if (gu.type === 'final' && gu.admitted) { pose = P.CHEER; }
            if (Math.abs(x - g.frontX) < 2 && clk >= gu.c && clk <= gu.lf + .3) front = gu;
            sctx.save(); sctx.translate(x, g.ground);
            var o2 = figure(sctx, pose, dir, gu.gold ? '#fde68a' : gu.color, 2.4, al, weapon); sctx.restore();
            if (o2) guestOuts.push({ gu: gu, x: x + o2.hx, y: g.ground + o2.hy });
        }
        scene.open += ((openT) - scene.open) * Math.min(1, dt * 8);
        drawDoor(g, scene.open, .1 + .6 * scene.open + (scene.finDone ? clamp((clk - scene.finDone) / .8, 0, 1) * .5 : 0));

        // görevli: okuyucu uzatır, sonuca göre tepki verir
        var aPose = mix(P.STAND, P.STAND, 0), aDir = -1, aWeap = null, scanCol = '#38bdf8', badge = null, scanning = false;
        aPose = P.STAND.slice(); aPose[0] += Math.sin(clk * 2.4) * .25;
        if (scene.armed && clk - scene.armed < 1.2) { aPose = P.SCAN; aWeap = 'scanner'; }
        if (front) {
            var rel = clk - front.c;
            if (rel > .45) { aPose = P.SCAN; aWeap = 'scanner'; }
            front.scan.forEach(function (s) { if (clk >= s[0] && clk <= s[1]) scanning = true; });
            front.res.forEach(function (rs) { if (clk >= rs.t && clk <= rs.t + .9) badge = { text: rs.text, ok: rs.ok, age: clk - rs.t }; if (clk >= rs.t) scanCol = rs.ok ? '#22c55e' : '#ef4444'; });
            if (front.type === 'used' && clk > front.c + 1.3 && clk < front.c + 2.2) { aPose = P.CROSS; aWeap = null; }
            else if ((front.type === 'ok' || front.type === 'final') && clk > front.c + 1.3 && clk < front.c + 2.0) { aDir = 1; aPose = P.SCAN; aWeap = null; }   // kapıyı gösterir
            else if (front.type === 'debt' && clk > front.c + 1.35 && clk < front.c + 2.0) { aPose = P.HOLD; aWeap = null; }
            else if (front.type === 'debt' && clk > front.c + 2.45 && clk < front.c + 3.0) { aDir = 1; aPose = P.SCAN; aWeap = null; }
            if (front.coin && clk >= front.coin[0] && clk <= front.coin[1]) { var cu = (clk - front.coin[0]) / (front.coin[1] - front.coin[0]); scene.coin = { x: g.frontX + 26 + ((g.attX - 22) - (g.frontX + 26)) * cu, y: g.ground - 62 - Math.sin(cu * Math.PI) * 14 }; } else scene.coin = null;
        } else scene.coin = null;
        if (scene.deny && clk - scene.deny < 1.5) { aPose = P.CROSS; aWeap = null; badge = { text: 'GİRİŞ REDDEDİLDİ', ok: false, age: clk - scene.deny }; scanCol = '#ef4444'; }
        else if (scene.deny) scene.deny = 0;
        sctx.save(); sctx.translate(g.attX, g.ground);
        var aOut = figure(sctx, aPose, aDir, '#f8fafc', 3, 1, aWeap, scanCol); sctx.restore();
        // yaka kartı / şapka (görevli olduğu belli olsun)
        sctx.save(); sctx.translate(g.attX, g.ground); sctx.strokeStyle = '#38bdf8'; sctx.lineWidth = 2.6; sctx.lineCap = 'round';
        var hy2 = -aPose[0] - Math.cos(aPose[1]) * 34.5; var hx2 = Math.sin(aPose[1]) * 34.5 * aDir;
        sctx.beginPath(); sctx.moveTo(hx2 - 7, hy2 - 5); sctx.lineTo(hx2 + 7, hy2 - 5); sctx.stroke(); sctx.restore();   // kep siperi
        // okuma ışını
        if (scanning && aOut) {
            var tgt = guestOuts.filter(function (q) { return q.gu === front; })[0];
            if (tgt) {
                var ax = g.attX + aOut.hx, ay = g.ground + aOut.hy; sctx.save(); sctx.strokeStyle = '#f87171'; sctx.lineWidth = 1.4; sctx.globalAlpha = .55 + Math.random() * .4;
                sctx.beginPath(); sctx.moveTo(ax, ay); sctx.lineTo(tgt.x + 4, tgt.y + (Math.random() - .5) * 5); sctx.stroke();
                sctx.globalAlpha = .2; sctx.lineWidth = 5; sctx.stroke(); sctx.restore();
            }
        }
        // para
        if (scene.coin) { sctx.fillStyle = '#fbbf24'; sctx.beginPath(); sctx.arc(scene.coin.x, scene.coin.y, 3.6, 0, 6.283); sctx.fill(); sctx.fillStyle = '#92400e'; sctx.font = '700 5px Arial'; sctx.textAlign = 'center'; sctx.textBaseline = 'middle'; sctx.fillText('₺', scene.coin.x, scene.coin.y + .3); }
        // sonuç rozeti
        if (badge) {
            var bs = clamp(badge.age / .18, 0, 1), pp = ease(bs), col = badge.ok ? '#4ade80' : (badge.text === 'ÖDEME BEKLİYOR' ? '#fbbf24' : '#f87171');
            pill(g.attX - 8, g.ground - 88 - 6 * (1 - pp), (badge.ok ? '✓ ' : '✕ ') + badge.text, col, clamp(1 - Math.max(0, badge.age - .65) / .25, 0, 1) * pp, .6 + .4 * pp);
        }
        // bitiş: son misafir girdikten sonra
        if (scene.finDone && !scene.finished && clk - scene.finDone > .7) { scene.finished = true; if (scene.doneCb) scene.doneCb(); }
    }

    /* ---------------- arka plan ---------------- */
    function drawBg(dt) {
        if (!bctx) return;
        bctx.clearRect(0, 0, W, H);
        energy *= Math.pow(.4, dt);
        var e = Math.max(energy, .1);
        bctx.globalCompositeOperation = 'lighter';
        for (var i = 0; i < beams.length; i++) {
            var b = beams[i], ang = Math.sin(t * b.sp * (1 + e * .8) + b.ph) * .34, a = .045 + e * .09, len = H * 1.3, spread = Math.max(100, W * .09);
            bctx.save(); bctx.translate(b.x * W, -30); bctx.rotate(ang);
            var gr = bctx.createLinearGradient(0, 0, 0, len); gr.addColorStop(0, 'rgba(' + b.c + ',' + a + ')'); gr.addColorStop(1, 'rgba(' + b.c + ',0)');
            bctx.fillStyle = gr; bctx.beginPath(); bctx.moveTo(-8, 0); bctx.lineTo(8, 0); bctx.lineTo(spread, len); bctx.lineTo(-spread, len); bctx.closePath(); bctx.fill(); bctx.restore();
        }
        for (var d = 0; d < dots.length; d++) {
            var o = dots[d]; o.y -= o.vy * (1 + e * 1.6) * dt; o.x += o.vx * dt; if (o.y < -20) { o.y = H + 20; o.x = rnd(0, W); }
            var al = (.07 + .06 * Math.sin(t * 1.2 + o.ph)) * (1 + e);
            var rg = bctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r * 2.2); rg.addColorStop(0, 'rgba(' + o.c + ',' + al + ')'); rg.addColorStop(1, 'rgba(' + o.c + ',0)');
            bctx.fillStyle = rg; bctx.beginPath(); bctx.arc(o.x, o.y, o.r * 2.2, 0, 6.283); bctx.fill();
        }
        bctx.globalCompositeOperation = 'source-over';
        for (var s = sparks.length - 1; s >= 0; s--) {
            var p = sparks[s]; p.age += dt; if (p.age > p.life) { sparks.splice(s, 1); continue; }
            p.vy += 300 * dt; p.x += p.vx * dt; p.y += p.vy * dt; bctx.globalAlpha = (1 - p.age / p.life) * .8; bctx.fillStyle = p.c;
            bctx.beginPath(); bctx.arc(p.x, p.y, p.s, 0, 6.283); bctx.fill();
        }
        bctx.globalAlpha = 1;
    }

    function frame(ts) {
        var dt = Math.min(.05, (ts - last) / 1000 || .016); last = ts; t += dt;
        if (!document.hidden && !window.__fxPause) { drawBg(dt); drawScene(dt); }
        requestAnimationFrame(frame);
    }
    function spark(x, y, n, cols) {
        for (var i = 0; i < n; i++) { if (sparks.length > 90) sparks.shift(); sparks.push({ x: x, y: y, vx: rnd(-90, 90), vy: rnd(-170, -30), life: rnd(.6, 1.1), age: 0, s: rnd(1.2, 2.6), c: (cols || ['#c7d2fe', '#93c5fd', '#ffffff'])[(Math.random() * 3) | 0] }); }
    }
    function letters(el, text, step, startDelay) {
        el.innerHTML = '';
        Array.prototype.forEach.call(text, function (ch, i) {
            var s = document.createElement('span'); if (ch === ' ') s.className = 'sp';
            s.textContent = ch === ' ' ? ' ' : ch; s.style.animationDelay = (startDelay + i * step) + 's'; el.appendChild(s);
        });
    }
    function pulseCard() {
        var card = document.getElementById('terminal'); if (!card) return;
        card.classList.add('fx-pulse'); clearTimeout(pulseCard._t); pulseCard._t = setTimeout(function () { card.classList.remove('fx-pulse'); }, 240);
    }
    function onType(e) {
        energy = Math.min(1, energy + .22); pulseCard();
        var r = e.target.getBoundingClientRect(); spark(r.left + r.width * rnd(.08, .92), r.top + r.height * .5, 2);
    }

    var api = {
        pulse: function () { energy = Math.min(1, energy + .4); },
        arm: function () { scene.armed = scene.clock; energy = Math.min(1, energy + .6); },
        fail: function () {
            energy = .8; scene.armed = 0; scene.deny = scene.clock;
            var card = document.getElementById('terminal');
            if (card) { card.classList.remove('fx-fail'); void card.offsetWidth; card.classList.add('fx-fail'); setTimeout(function () { card.classList.remove('fx-fail'); }, 520); }
        },
        // readyPromise: veriler hazır olana kadar gişe sahnesi sürer; sonra son misafir (sen) okutup içeri girer.
        success: function (name, done, readyPromise) {
            var ov = document.getElementById('fxWelcomeOverlay'), finished = false;
            var nm = String(name || '').trim();
            try { nm = nm.charAt(0).toLocaleUpperCase('tr-TR') + nm.slice(1); } catch (_) {}
            var skip = function () { go(); };
            var go = function () {
                if (finished) return; finished = true;
                document.removeEventListener('keydown', skip); document.removeEventListener('pointerdown', skip);
                if (ov) { document.getElementById('fxName').textContent = nm; ov.classList.add('show'); }
                setTimeout(function () { if (done) done(); }, reduce ? 400 : 700);
            };
            var simple = reduce || !sctx || !geom();
            var markReady = function () { scene.ready = true; if (simple) go(); };
            if (readyPromise && readyPromise.then) readyPromise.then(markReady, markReady); else markReady();
            if (simple) return;
            scene.armed = 0; scene.finished = false; scene.doneCb = go; scene.wantFinal = true;
            setTimeout(function () { document.addEventListener('keydown', skip); document.addEventListener('pointerdown', skip); }, 350);
        },
        _debug: { scene: scene, P: P, figure: function (pose, dir, col, lw, a, weapon, wcol) { return figure(sctx, pose, dir, col, lw, a, weapon, wcol); }, ctx: function () { return sctx; } }
    };
    window.LoginFX = api;

    function init() {
        var wl = document.getElementById('fxWelcome'); if (wl) letters(wl, 'Hoş geldiniz', .05, .35);
        ['username', 'password'].forEach(function (id) {
            var el = document.getElementById(id); if (!el) return;
            el.addEventListener('input', onType); el.addEventListener('focus', function () { energy = Math.max(energy, .4); });
        });
        var btn = document.getElementById('loginBtn');
        if (btn) btn.addEventListener('pointerdown', function (e) {
            var r = btn.getBoundingClientRect(), s = document.createElement('span'), d = Math.max(r.width, r.height);
            s.className = 'fx-ripple'; s.style.width = s.style.height = d + 'px'; s.style.left = (e.clientX - r.left - d / 2) + 'px'; s.style.top = (e.clientY - r.top - d / 2) + 'px';
            btn.appendChild(s); setTimeout(function () { s.remove(); }, 700); api.arm();
        });
        if (!reduce && (bctx || sctx)) { resize(); window.addEventListener('resize', resize); requestAnimationFrame(frame); }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
