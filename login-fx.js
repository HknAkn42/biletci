/* BiletPro giriş ekranı: sade sahne ışıkları + çubuk adam gösterisi.
   Kapıdan çıkan bıçaklı, kılıçlı ve silahlı adamlar; kahramanımız Matrix gibi savuşturur. Veriler yüklenirken (ready gelene kadar) gösteri turlar halinde sürer.
   Dış kütüphane yok. Tıklama/tuş ile atlanır. */
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
        GUARD: [31, .12, 1.25, 1.25, .9, 1.7, .55, -.55, -.45, .35],
        JAB: [30, .3, 1.57, 0, .9, 1.7, .75, -.7, -.6, .3],
        KICK: [28, -.3, .7, 1.4, 1.1, 1.6, 1.55, 0, -.35, .15],
        HIGH: [27, -.48, .5, 1.2, 1.3, 1.2, 2.05, -.1, -.3, .1],
        UPPER: [28, .22, 2.55, .3, .9, 1.6, .8, -.7, -.5, .3],
        FLAIL: [30, -.3, 2.6, .4, 2.2, -.4, 1.0, .6, -.8, .5],
        HIT: [32, -.5, 1.0, .6, 1.6, .5, .3, -.3, -.3, .4],
        NO: [33, 0, .3, .3, -.2, .2, .1, 0, -.1, 0],
        MATRIX: [24, -1.0, 1.1, .4, -1.0, -.4, 1.1, -1.0, .7, -.5],      // geriye yatış (kurşun kaçırma)
        LEAN: [29, -.5, .9, .8, .7, 1.4, .7, -.7, -.5, .3],                 // hafif geri çekilme
        SW_UP: [31, -.1, 2.9, .2, .8, 1.6, .3, -.3, -.3, .3],              // kılıç havada
        SW_DN: [29, .35, 1.1, .2, .8, 1.6, .8, -.6, -.5, .2],               // kılıç iniyor
        AIM: [31, .05, 1.57, 0, 1.3, .6, .4, -.4, -.4, .3],                 // silah doğrultulmuş
        BOW: [30, .55, .4, .5, .2, .5, .2, -.1, -.2, .1]                    // selam
    };
    function mix(a, b, u) { var o = []; for (var i = 0; i < a.length; i++) o.push(a[i] + (b[i] - a[i]) * u); return o; }
    function keyPose(keys, tt) {
        if (tt <= keys[0][0]) return keys[0][1];
        for (var i = 1; i < keys.length; i++) {
            if (tt <= keys[i][0]) { var a = keys[i - 1], b = keys[i]; return mix(a[1], b[1], ease(clamp((tt - a[0]) / Math.max(1e-4, b[0] - a[0]), 0, 1))); }
        }
        return keys[keys.length - 1][1];
    }
    function walkPose(ph, lean) {
        var s = Math.sin(ph), c = Math.cos(ph);
        return [32 + Math.abs(c) * 1.2, lean || .08, .1 + s * .7, .35, .1 - s * .7, .35, s * .65, -Math.max(0, -c) * .8 - .05, -s * .65, -Math.max(0, c) * .8 - .05];
    }
    // dir: +1 sağa, -1 sola bakar. Orijinde (0, zemin) ayakta durur. Silah (knife/sword/gun) ön elde taşınır. Geri dönüş: ön el ve silah ucu.
    function figure(ctx, pose, dir, col, lw, a, weapon) {
        var hh = pose[0], tor = pose[1], d = dir, hx = 0, hy = -hh;
        var lim = function (x, y, len, ang) { return [x + Math.sin(ang) * len * d, y + Math.cos(ang) * len]; };
        var shx = hx + Math.sin(tor) * 24 * d, shy = hy - Math.cos(tor) * 24;
        var cx = shx + Math.sin(tor) * 10.5 * d, cy = shy - Math.cos(tor) * 10.5;
        var out = null;
        function limb(x0, y0, l1, a1, l2, a2, alpha, wp) {
            var m = lim(x0, y0, l1, a1), e = lim(m[0], m[1], l2, a1 + a2);
            ctx.globalAlpha = a * alpha; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(m[0], m[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
            if (wp) { var fa = a1 + a2, vx = Math.sin(fa) * d, vy = Math.cos(fa); out = { hx: e[0], hy: e[1], vx: vx, vy: vy }; }
        }
        ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        limb(hx, hy, 17, pose[8], 17, pose[9], .7);
        limb(shx, shy, 13, pose[4], 12, pose[5], .7);
        ctx.globalAlpha = a; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(shx, shy); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, 7, 0, 6.283); ctx.stroke();
        limb(hx, hy, 17, pose[6], 17, pose[7], 1);
        limb(shx, shy, 13, pose[2], 12, pose[3], 1, true);
        if (weapon && out) {
            ctx.globalAlpha = a; ctx.strokeStyle = '#e2e8f0'; var x0 = out.hx, y0 = out.hy;
            if (weapon === 'knife') { ctx.lineWidth = lw * .9; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + out.vx * 14, y0 + out.vy * 14); ctx.stroke(); out.tx = x0 + out.vx * 14; out.ty = y0 + out.vy * 14; }
            else if (weapon === 'sword') {
                ctx.lineWidth = lw * 1.0; ctx.beginPath(); ctx.moveTo(x0 - out.vx * 3, y0 - out.vy * 3); ctx.lineTo(x0 + out.vx * 38, y0 + out.vy * 38); ctx.stroke();
                ctx.lineWidth = lw * .9; ctx.beginPath(); ctx.moveTo(x0 + out.vx * 3 - out.vy * 5, y0 + out.vy * 3 + out.vx * 5); ctx.lineTo(x0 + out.vx * 3 + out.vy * 5, y0 + out.vy * 3 - out.vx * 5); ctx.stroke();
                out.tx = x0 + out.vx * 38; out.ty = y0 + out.vy * 38;
            } else if (weapon === 'gun') {
                ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = lw * 1.25; ctx.beginPath(); ctx.moveTo(x0 + out.vx * 1, y0 + out.vy * 1); ctx.lineTo(x0 + out.vx * 12, y0 + out.vy * 12); ctx.stroke();
                ctx.lineWidth = lw * 1.0; ctx.beginPath(); ctx.moveTo(x0 + out.vx * 3, y0 + out.vy * 3); ctx.lineTo(x0 + out.vx * 2.4, y0 + out.vy * 2.4 + 7); ctx.stroke();
                out.tx = x0 + out.vx * 12; out.ty = y0 + out.vy * 12;
            }
        }
        ctx.globalAlpha = 1;
        return out;
    }

    /* ---------------- sahne durumu ---------------- */
    var SPEED = 1.9;
    var scene = { mode: 'idle', tt: 0, round: null, roundN: 0, phase: 'round', pt: 0, armed: 0, shake: 0, flashes: [], doneCb: null, finished: false, no: 0, ready: false, slow: 0, bullets: [] };
    var ENEMY_COL = '#94a3b8', HERO_COL = '#f1f5f9';
    var WEAPON_ORDERS = [['knife', 'sword', 'gun'], ['sword', 'gun', 'knife'], ['gun', 'knife', 'sword'], ['knife', 'gun', 'sword']];

    // Bir tur: 3 düşman (bıçak / kılıç / silah). Zamanlar "hikâye saniyesi"dir; silah anında hikâye yavaşlar (bullet time).
    function buildRound(order) {
        var enemies = [], heroKeys = [[0, P.GUARD]], prevTf = -.2, slow = null;
        order.forEach(function (w, i) {
            var ta = (i === 0 ? .75 : prevTf + .12), ts = ta - .7, sm, th;
            var ek = [];                                  // düşman hareket anahtarları
            if (w === 'knife') { sm = ta + .2; th = ta + .5; ek = [[ta, P.GUARD], [sm - .12, P.GUARD], [sm, P.JAB], [sm + .16, P.JAB], [th, P.GUARD]]; }
            else if (w === 'sword') { sm = ta + .42; th = ta + .82; ek = [[ta, P.GUARD], [ta + .1, P.SW_UP], [sm - .02, P.SW_UP], [sm + .1, P.SW_DN], [sm + .25, P.SW_DN], [th, P.GUARD]]; }
            else { sm = ta + .3; th = sm + .5 + .32; ek = [[ta, P.GUARD], [ta + .12, P.AIM], [sm, P.AIM], [sm + .05, P.HIT], [sm + .2, P.AIM], [th, P.AIM]]; slow = [sm, sm + .5]; }
            var tf = th + .12, te = tf + .62;
            if (w === 'knife') heroKeys.push([sm - .15, P.GUARD], [sm + .05, P.LEAN], [sm + .22, P.LEAN], [th - .08, P.GUARD], [th, P.JAB], [th + .12, P.JAB], [th + .26, P.KICK], [tf + .05, P.KICK], [tf + .2, P.GUARD]);
            else if (w === 'sword') heroKeys.push([sm - .2, P.GUARD], [sm + .02, P.MATRIX], [sm + .3, P.MATRIX], [th - .1, P.LEAN], [th, P.HIGH], [th + .14, P.HIGH], [tf + .2, P.GUARD]);
            else heroKeys.push([sm - .15, P.GUARD], [sm + .12, P.MATRIX], [sm + .5, P.MATRIX], [th - .12, P.LEAN], [th, P.UPPER], [th + .15, P.UPPER], [tf + .2, P.GUARD]);
            enemies.push({ w: w, ts: ts, ta: ta, sm: sm, th: th, tf: tf, te: te, ek: ek, side: [-1, 1, -.25][i], maxS: [7, 8.5, 11][i], hit: false, thr: false, fired: false, i: i });
            prevTf = tf;
        });
        var end = enemies[enemies.length - 1].te + .2;
        heroKeys.push([end, P.GUARD]);
        heroKeys.sort(function (a, b) { return a[0] - b[0]; });
        return { enemies: enemies, heroKeys: heroKeys, end: end, slow: slow };
    }

    function geom() {
        var el = document.getElementById('fxScene'); if (!el) return null;
        var r = el.getBoundingClientRect(); if (r.width < 40) return null;
        return { x: r.left, y: r.top, w: r.width, h: r.height, ground: r.top + r.height - 12, heroX: r.left + r.width * .2, doorX: r.left + r.width * .86 };
    }

    function drawDoor(g, open, glow) {
        var x = g.doorX, gy = g.ground, w = 36, h = 66;
        sctx.save();
        if (glow > .02) {
            var lg = sctx.createLinearGradient(x - w / 2, 0, x - w / 2 - 150, 0);
            lg.addColorStop(0, 'rgba(255,240,205,' + (.34 * glow) + ')'); lg.addColorStop(1, 'rgba(255,240,205,0)');
            sctx.fillStyle = lg; sctx.beginPath(); sctx.moveTo(x - w / 2, gy - h * .35 * open); sctx.lineTo(x - w / 2 - 150, gy - 6); sctx.lineTo(x - w / 2 - 150, gy + 2); sctx.lineTo(x - w / 2, gy + 2); sctx.closePath(); sctx.fill();
        }
        sctx.fillStyle = 'rgba(10,14,30,.92)'; sctx.strokeStyle = 'rgba(148,163,184,.75)'; sctx.lineWidth = 2.2;
        sctx.beginPath(); sctx.rect(x - w / 2, gy - h, w, h); sctx.fill(); sctx.stroke();
        var ig = sctx.createLinearGradient(0, gy - h, 0, gy);
        ig.addColorStop(0, 'rgba(255,244,214,' + (.15 + .8 * glow) + ')'); ig.addColorStop(1, 'rgba(255,225,170,' + (.2 + .75 * glow) + ')');
        sctx.fillStyle = ig; sctx.fillRect(x - w / 2 + 2, gy - h + 2, w - 4, h - 3);
        var lw2 = (w - 4) * (1 - open * .88);
        sctx.fillStyle = 'rgba(51,65,85,.98)'; sctx.strokeStyle = 'rgba(148,163,184,.8)'; sctx.lineWidth = 1.4;
        sctx.beginPath(); sctx.moveTo(x + w / 2 - 2, gy - h + 2); sctx.lineTo(x + w / 2 - 2 - lw2, gy - h + 2 + open * 4); sctx.lineTo(x + w / 2 - 2 - lw2, gy - 2 - open * 4); sctx.lineTo(x + w / 2 - 2, gy - 2); sctx.closePath(); sctx.fill(); sctx.stroke();
        if (open < .3) { sctx.fillStyle = 'rgba(203,213,225,.9)'; sctx.beginPath(); sctx.arc(x - w / 2 + 8, gy - h * .45, 1.6, 0, 6.283); sctx.fill(); }
        sctx.restore();
    }

    function flash(x, y) { scene.flashes.push({ x: x, y: y, age: 0 }); scene.shake = .16; }
    function startRound() {
        var order = WEAPON_ORDERS[scene.roundN % WEAPON_ORDERS.length]; scene.roundN++;
        scene.round = buildRound(order); scene.tt = 0; scene.phase = 'round'; scene.bullets = [];
    }

    function drawScene(dt) {
        if (!sctx) return;
        sctx.clearRect(0, 0, W, H);
        var g = geom(); if (!g) return;
        var mode = scene.mode;
        var sh = scene.shake > 0 ? (Math.random() - .5) * 5 : 0; if (scene.shake > 0) scene.shake -= dt;
        sctx.save(); sctx.translate(sh, sh * .6);
        var fl = sctx.createLinearGradient(g.x, 0, g.x + g.w, 0);
        fl.addColorStop(0, 'rgba(148,163,184,0)'); fl.addColorStop(.2, 'rgba(148,163,184,.35)'); fl.addColorStop(.8, 'rgba(148,163,184,.35)'); fl.addColorStop(1, 'rgba(148,163,184,0)');
        sctx.strokeStyle = fl; sctx.lineWidth = 1.5; sctx.beginPath(); sctx.moveTo(g.x, g.ground + 1); sctx.lineTo(g.x + g.w, g.ground + 1); sctx.stroke();

        var heroX = g.heroX, heroPose = P.STAND, heroA = 1, open = 0, glow = .08 + (scene.armed ? .22 : 0), heroScale = 1, ghosts = 0;
        var enemies = [], slowAmt = 0;
        if (mode === 'idle') {
            var b = Math.sin(t * 2.2) * .8;
            heroPose = mix(P.GUARD, P.STAND, .35).slice(); heroPose[0] += b * .3;
            var cyc = t % 7; if (cyc > 6.2 && cyc < 6.6) heroPose = mix(P.GUARD, P.JAB, Math.sin((cyc - 6.2) / .4 * Math.PI));
            if (scene.armed) { var u = clamp((t - scene.armed) / .5, 0, 1); heroPose = mix(heroPose, P.GUARD, ease(u)); }
            if (scene.no) { var nu = (t - scene.no); if (nu < .9) { heroX += Math.sin(nu * 28) * 3 * (1 - nu / .9); heroPose = P.NO; glow = .02; } else scene.no = 0; }
        } else {
            if (!scene.round) startRound();
            var R = scene.round;
            var rate = 1;
            if (scene.phase === 'round' && R.slow && scene.tt > R.slow[0] - .06 && scene.tt < R.slow[1] + .08) rate = .26;
            slowAmt = rate < 1 ? 1 : 0; scene.slow += (slowAmt - scene.slow) * Math.min(1, dt * 10);
            scene.tt += dt * SPEED * rate; scene.pt += dt * SPEED;
            if (scene.phase === 'round') {
                var tt = scene.tt;
                open = tt < .35 ? ease(tt / .35) : (tt > R.end - .15 && !scene.ready ? 1 - ease(clamp((tt - (R.end - .15)) / .15, 0, 1)) : 1); glow = .3 + .7 * open;
                heroPose = keyPose(R.heroKeys, tt); ghosts = scene.slow > .5 ? 3 : 0;
                R.enemies.forEach(function (en, idx) {
                    if (tt < en.ts || tt > en.te) return;
                    var standX = g.heroX + 52, startX = g.doorX - 4, ex = standX, ep, ea = 1, ey = 0, es = 1, er = 0;
                    if (tt < en.ta) { var au = (tt - en.ts) / (en.ta - en.ts); ex = startX + (standX - startX) * au; ep = walkPose(tt * 10 + idx, -.05); ea = clamp((tt - en.ts) / .12, 0, 1); }
                    else if (tt < en.th) { ep = keyPose(en.ek, tt); if (en.w === 'sword' && tt > en.sm + .1 && tt < en.sm + .3) ex = standX - 6; }
                    else if (tt < en.tf) { var ru = (tt - en.th) / (en.tf - en.th); ex = standX + 14 * ease(ru); ep = P.HIT; if (!en.hit) { en.hit = true; flash(standX - 6, g.ground - 42); } }
                    else {
                        var tu = clamp((tt - en.tf) / (en.te - en.tf), 0, 1), k = Math.pow(tu, 1.5), x0 = standX + 14, y0 = g.ground - 38;
                        if (!en.thr) { en.thr = true; flash(standX, g.ground - 30); }
                        var tx = W * (.5 + en.side * .2), ty = H * .38;
                        ex = x0 + (tx - x0) * k; ey = (ty - y0) * k; es = 1 + (en.maxS - 1) * Math.pow(tu, 2.2); er = en.side * tu * 5.5 * (idx % 2 ? -1 : 1);
                        ea = tu > .78 ? 1 - (tu - .78) / .22 : 1;
                        enemies.push({ x: ex, y: g.ground - 38 + ey, s: es, rot: er, a: ea, pose: P.FLAIL, front: true, tu: tu, w: en.w });
                        return;
                    }
                    if (en.w === 'gun' && !en.fired && tt >= en.sm) { en.fired = true; for (var bi = 0; bi < 3; bi++) scene.bullets.push({ t0: en.sm + bi * .07, x0: ex - 16, y0: g.ground - 50 - bi * 3, ty: g.ground - 56 + (bi - 1) * 5 }); flash(ex - 20, g.ground - 50); }
                    enemies.push({ x: ex, y: g.ground, s: es, rot: er, a: ea, pose: ep, front: false, w: en.w });
                });
                if (tt > R.end) { scene.phase = scene.ready ? 'exit' : 'gap'; scene.pt = 0; }
            } else if (scene.phase === 'gap') {
                heroPose = mix(P.GUARD, P.BOW, Math.sin(clamp(scene.pt / .8, 0, 1) * Math.PI)); open = 1 - ease(clamp(scene.pt / .3, 0, 1)); glow = open * .8 + .1;
                if (scene.ready) { scene.phase = 'exit'; scene.pt = 0; } else if (scene.pt > .85) startRound();
            }
            if (scene.phase === 'exit') {
                var pt = scene.pt;
                if (pt < .75) { heroX = g.heroX + (g.doorX - 26 - g.heroX) * ease(pt / .75); heroPose = walkPose(pt * 11, .1); open = 1; glow = 1; }
                else if (pt < 1.25) { var eu = (pt - .75) / .5; heroX = g.doorX - 26 + 22 * ease(eu); heroPose = walkPose(pt * 11, .1); heroA = 1 - ease(eu); heroScale = 1 - .12 * eu; open = 1; glow = 1; }
                else { heroA = 0; open = 1 - ease(clamp((pt - 1.25) / .3, 0, 1)); glow = open; if (pt > 1.65 && !scene.finished) { scene.finished = true; if (scene.doneCb) scene.doneCb(); } }
            }
        }
        drawDoor(g, open, glow);
        enemies.forEach(function (en) { if (en.front) return; sctx.save(); sctx.translate(en.x, en.y); figure(sctx, en.pose, -1, ENEMY_COL, 2.4, en.a, en.w); sctx.restore(); });
        if (ghosts && heroA > .01) { for (var gi = 3; gi >= 1; gi--) { sctx.save(); sctx.translate(heroX - gi * 9, g.ground); figure(sctx, heroPose, 1, '#93c5fd', 2.4, .2 / gi); sctx.restore(); } }
        if (heroA > .01) { sctx.save(); sctx.translate(heroX, g.ground); sctx.scale(heroScale, heroScale); figure(sctx, heroPose, 1, HERO_COL, 2.6, heroA); sctx.restore(); }
        for (var bI = scene.bullets.length - 1; bI >= 0; bI--) {
            var bl = scene.bullets[bI], bu = (scene.tt - bl.t0) / .62;
            if (bu < 0) continue; if (bu > 1.2) { scene.bullets.splice(bI, 1); continue; }
            var bx = bl.x0 + ((heroX - 80) - bl.x0) * bu, by = bl.y0 + (bl.ty - bl.y0) * bu;
            sctx.save(); sctx.strokeStyle = '#fde68a'; sctx.lineWidth = 2; sctx.globalAlpha = .9; sctx.beginPath(); sctx.moveTo(bx + 22, by - (bl.ty - bl.y0) * .035); sctx.lineTo(bx, by); sctx.stroke();
            sctx.globalAlpha = .25; sctx.lineWidth = 6; sctx.beginPath(); sctx.moveTo(bx + 46, by - (bl.ty - bl.y0) * .07); sctx.lineTo(bx, by); sctx.stroke(); sctx.restore();
        }
        sctx.restore();
        for (var f = scene.flashes.length - 1; f >= 0; f--) {
            var fx = scene.flashes[f]; fx.age += dt; if (fx.age > .3) { scene.flashes.splice(f, 1); continue; }
            var fu = fx.age / .3; sctx.save(); sctx.globalAlpha = 1 - fu; sctx.strokeStyle = '#fff'; sctx.lineWidth = 2;
            sctx.beginPath(); sctx.arc(fx.x, fx.y, 6 + fu * 26, 0, 6.283); sctx.stroke();
            for (var r = 0; r < 7; r++) { var an = r * .9 + 1.1, r1 = 8 + fu * 14, r2 = 14 + fu * 30; sctx.beginPath(); sctx.moveTo(fx.x + Math.cos(an) * r1, fx.y + Math.sin(an) * r1); sctx.lineTo(fx.x + Math.cos(an) * r2, fx.y + Math.sin(an) * r2); sctx.stroke(); }
            sctx.restore();
        }
        enemies.forEach(function (en) {
            if (!en.front) return;
            for (var gI = 3; gI >= 0; gI--) {
                var back = gI * .05, ghostA = gI === 0 ? en.a : en.a * .16 / gI;
                sctx.save();
                var gx = en.x - (en.x - (g.heroX + 64)) * (back * 4), gy = en.y + (gI * 6);
                sctx.translate(gI === 0 ? en.x : gx, gI === 0 ? en.y : gy); sctx.rotate(en.rot); sctx.scale(en.s * (1 - gI * .04), en.s * (1 - gI * .04)); sctx.translate(0, 38);
                figure(sctx, en.pose, -1, ENEMY_COL, 2.6, ghostA, en.w); sctx.restore();
            }
        });
        if (scene.slow > .02) {
            var vg = sctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .25, W / 2, H / 2, Math.max(W, H) * .75);
            vg.addColorStop(0, 'rgba(0,12,20,0)'); vg.addColorStop(1, 'rgba(0,20,18,' + (.45 * scene.slow) + ')');
            sctx.fillStyle = vg; sctx.fillRect(0, 0, W, H);
        }
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
        arm: function () { scene.armed = t; energy = Math.min(1, energy + .6); },
        fail: function () {
            energy = .8; scene.armed = 0; scene.no = t;
            var card = document.getElementById('terminal');
            if (card) { card.classList.remove('fx-fail'); void card.offsetWidth; card.classList.add('fx-fail'); setTimeout(function () { card.classList.remove('fx-fail'); }, 520); }
        },
        // readyPromise: veriler hazır olana kadar gösteri turlar halinde sürer. Atlamak için tıkla / tuşa bas.
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
            scene.mode = 'fight'; scene.round = null; scene.roundN = 0; scene.armed = 0; scene.finished = false; scene.doneCb = go; scene.phase = 'round'; scene.pt = 0;
            setTimeout(function () { document.addEventListener('keydown', skip); document.addEventListener('pointerdown', skip); }, 350);
        },
        _debug: { P: P, figure: function (pose, dir, col, lw, a, weapon) { return figure(sctx, pose, dir, col, lw, a, weapon); }, ctx: function () { return sctx; } }
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
