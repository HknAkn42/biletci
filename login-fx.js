/* BiletPro giriş ekranı: sade sahne ışıkları + çubuk adam sahnesi (kapıdan çıkan 3 adamı yener, kapıdan girer).
   Dış kütüphane yok. Tıklama/Enter/Esc ile animasyon atlanır. */
(function () {
    'use strict';
    var reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}
    var bg = document.getElementById('fxCanvas'), bctx = bg && bg.getContext ? bg.getContext('2d') : null;
    var sc = document.getElementById('fxSceneCv'), sctx = sc && sc.getContext ? sc.getContext('2d') : null;
    var W = 0, H = 0, dpr = 1, energy = .1, last = 0, t = 0;
    var dots = [], sparks = [];
    var beams = [
        { x: .18, c: '99,102,241', ph: 0.0, sp: .30 },
        { x: .50, c: '59,130,246', ph: 2.0, sp: .24 },
        { x: .82, c: '148,163,184', ph: 4.0, sp: .34 },
        { x: .34, c: '129,140,248', ph: 1.1, sp: .20 }
    ];
    var rnd = function (a, b) { return a + Math.random() * (b - a); };
    var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
    var ease = function (u) { return u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; };

    function resize() {
        dpr = Math.min(2, window.devicePixelRatio || 1);
        W = window.innerWidth; H = window.innerHeight;
        // arka plan yumuşak ışıklar: düşük çözünürlük yeter (pil/performans); sahne tuvali net kalır
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
        NO: [33, 0, .3, .3, -.2, .2, .1, 0, -.1, 0]
    };
    function mix(a, b, u) { var o = []; for (var i = 0; i < a.length; i++) o.push(a[i] + (b[i] - a[i]) * u); return o; }
    function keyPose(keys, tt) {
        if (tt <= keys[0][0]) return keys[0][1];
        for (var i = 1; i < keys.length; i++) {
            if (tt <= keys[i][0]) { var a = keys[i - 1], b = keys[i]; return mix(a[1], b[1], ease(clamp((tt - a[0]) / (b[0] - a[0]), 0, 1))); }
        }
        return keys[keys.length - 1][1];
    }
    function walkPose(ph, lean) {
        var s = Math.sin(ph), c = Math.cos(ph);
        return [32 + Math.abs(c) * 1.2, lean || .08, .1 + s * .7, .35, .1 - s * .7, .35, s * .65, -Math.max(0, -c) * .8 - .05, -s * .65, -Math.max(0, c) * .8 - .05];
    }
    // dir: +1 sağa, -1 sola bakar. Orijinde (0, ground) ayakta durur.
    function figure(ctx, pose, dir, col, lw, a) {
        var hh = pose[0], tor = pose[1], d = dir;
        var hx = 0, hy = -hh;
        var lim = function (x, y, len, ang) { return [x + Math.sin(ang) * len * d, y + Math.cos(ang) * len]; };
        var shx = hx + Math.sin(tor) * 24 * d, shy = hy - Math.cos(tor) * 24;
        var cx = shx + Math.sin(tor) * 10.5 * d, cy = shy - Math.cos(tor) * 10.5;
        function limb(x0, y0, l1, a1, l2, a2, alpha) {
            var m = lim(x0, y0, l1, a1), e = lim(m[0], m[1], l2, a1 + a2);
            ctx.globalAlpha = a * alpha; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(m[0], m[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
        }
        ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        limb(hx, hy, 17, pose[8], 17, pose[9], .7);
        limb(shx, shy, 13, pose[4], 12, pose[5], .7);
        ctx.globalAlpha = a; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(shx, shy); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, 7, 0, 6.283); ctx.stroke();
        limb(hx, hy, 17, pose[6], 17, pose[7], 1);
        limb(shx, shy, 13, pose[2], 12, pose[3], 1);
        ctx.globalAlpha = 1;
    }

    /* ---------------- sahne durumu ---------------- */
    var SPEED = 1.9;
    var scene = { mode: 'idle', t0: 0, armed: 0, shake: 0, flashes: [], doneCb: null, finished: false, no: 0 };
    var HERO_KEYS = [[0, P.GUARD], [.9, P.GUARD], [1.05, P.JAB], [1.2, P.JAB], [1.3, P.GUARD], [1.4, P.KICK], [1.55, P.KICK], [1.68, P.GUARD], [1.92, P.GUARD], [2.02, P.HIGH], [2.17, P.HIGH], [2.28, P.GUARD], [2.45, P.GUARD], [2.52, P.JAB], [2.6, P.UPPER], [2.78, P.UPPER], [2.9, P.GUARD], [3.3, P.GUARD]];
    var ENEMIES = [
        { ts: .25, ta: 1.0, th: 1.2, tf: 1.4, te: 2.0, side: -1, maxS: 7, hit: false, thr: false },
        { ts: .75, ta: 1.8, th: 1.97, tf: 2.06, te: 2.62, side: 1, maxS: 8.5, hit: false, thr: false },
        { ts: 1.3, ta: 2.4, th: 2.6, tf: 2.7, te: 3.4, side: -.3, maxS: 11, hit: false, thr: false }
    ];
    var ENEMY_COL = '#94a3b8', HERO_COL = '#f1f5f9';

    function geom() {
        var el = document.getElementById('fxScene'); if (!el) return null;
        var r = el.getBoundingClientRect();
        if (r.width < 40) return null;
        return { x: r.left, y: r.top, w: r.width, h: r.height, ground: r.top + r.height - 12, heroX: r.left + r.width * .2, doorX: r.left + r.width * .86 };
    }

    function drawDoor(g, open, glow) {
        var x = g.doorX, gy = g.ground, w = 36, h = 66;
        sctx.save();
        // zemine dökülen ışık
        if (glow > .02) {
            var lg = sctx.createLinearGradient(x - w / 2, 0, x - w / 2 - 150, 0);
            lg.addColorStop(0, 'rgba(255,240,205,' + (.34 * glow) + ')'); lg.addColorStop(1, 'rgba(255,240,205,0)');
            sctx.fillStyle = lg; sctx.beginPath(); sctx.moveTo(x - w / 2, gy - h * .35 * open); sctx.lineTo(x - w / 2 - 150, gy - 6); sctx.lineTo(x - w / 2 - 150, gy + 2); sctx.lineTo(x - w / 2, gy + 2); sctx.closePath(); sctx.fill();
        }
        // kasa
        sctx.fillStyle = 'rgba(10,14,30,.92)'; sctx.strokeStyle = 'rgba(148,163,184,.75)'; sctx.lineWidth = 2.2;
        sctx.beginPath(); sctx.rect(x - w / 2, gy - h, w, h); sctx.fill(); sctx.stroke();
        // iç ışık
        var ig = sctx.createLinearGradient(0, gy - h, 0, gy);
        ig.addColorStop(0, 'rgba(255,244,214,' + (.15 + .8 * glow) + ')'); ig.addColorStop(1, 'rgba(255,225,170,' + (.2 + .75 * glow) + ')');
        sctx.fillStyle = ig; sctx.fillRect(x - w / 2 + 2, gy - h + 2, w - 4, h - 3);
        // kanat (menteşe sağda; açıldıkça daralır)
        var lw2 = (w - 4) * (1 - open * .88);
        sctx.fillStyle = 'rgba(51,65,85,.98)'; sctx.strokeStyle = 'rgba(148,163,184,.8)'; sctx.lineWidth = 1.4;
        sctx.beginPath(); sctx.moveTo(x + w / 2 - 2, gy - h + 2); sctx.lineTo(x + w / 2 - 2 - lw2, gy - h + 2 + open * 4); sctx.lineTo(x + w / 2 - 2 - lw2, gy - 2 - open * 4); sctx.lineTo(x + w / 2 - 2, gy - 2); sctx.closePath(); sctx.fill(); sctx.stroke();
        if (open < .3) { sctx.fillStyle = 'rgba(203,213,225,.9)'; sctx.beginPath(); sctx.arc(x - w / 2 + 8, gy - h * .45, 1.6, 0, 6.283); sctx.fill(); }
        sctx.restore();
    }

    function flash(x, y) { scene.flashes.push({ x: x, y: y, age: 0 }); scene.shake = .16; }

    function drawScene(dt) {
        if (!sctx) return;
        sctx.clearRect(0, 0, W, H);
        var g = geom(); if (!g) return;
        var tt = 0, mode = scene.mode;
        var sh = scene.shake > 0 ? (Math.random() - .5) * 5 : 0; if (scene.shake > 0) scene.shake -= dt;
        sctx.save(); sctx.translate(sh, sh * .6);
        // zemin çizgisi
        var fl = sctx.createLinearGradient(g.x, 0, g.x + g.w, 0);
        fl.addColorStop(0, 'rgba(148,163,184,0)'); fl.addColorStop(.2, 'rgba(148,163,184,.35)'); fl.addColorStop(.8, 'rgba(148,163,184,.35)'); fl.addColorStop(1, 'rgba(148,163,184,0)');
        sctx.strokeStyle = fl; sctx.lineWidth = 1.5; sctx.beginPath(); sctx.moveTo(g.x, g.ground + 1); sctx.lineTo(g.x + g.w, g.ground + 1); sctx.stroke();

        var heroX = g.heroX, heroPose = P.STAND, heroA = 1, open = 0, glow = .08 + (scene.armed ? .22 : 0), heroDir = 1, heroScale = 1;
        var enemies = [];
        if (mode === 'idle') {
            var b = Math.sin(t * 2.2) * .8;
            heroPose = mix(P.GUARD, P.STAND, .35); heroPose = heroPose.slice(); heroPose[0] += b * .3;
            // ara sıra jab
            var cyc = t % 7; if (cyc > 6.2 && cyc < 6.6) heroPose = mix(P.GUARD, P.JAB, Math.sin((cyc - 6.2) / .4 * Math.PI));
            if (scene.armed) { var u = clamp((t - scene.armed) / .5, 0, 1); heroPose = mix(heroPose, P.GUARD, ease(u)); }
            if (scene.no) { var nu = (t - scene.no); if (nu < .9) { heroX += Math.sin(nu * 28) * 3 * (1 - nu / .9); heroPose = P.NO; glow = .02; } else scene.no = 0; }
        } else if (mode === 'fight') {
            tt = (t - scene.t0) * SPEED;
            open = ease(clamp(tt / .35, 0, 1)); glow = .3 + .7 * open;
            // kahraman
            if (tt < 3.3) heroPose = keyPose(HERO_KEYS, tt);
            else if (tt < 4.05) {                          // kapıya yürü
                var wu = (tt - 3.3) / .75; heroX = g.heroX + (g.doorX - 26 - g.heroX) * ease(wu); heroPose = walkPose((tt - 3.3) * 11, .1);
            } else if (tt < 4.55) {                         // içeri gir
                var eu = (tt - 4.05) / .5; heroX = g.doorX - 26 + 22 * ease(eu); heroPose = walkPose((tt - 3.3) * 11, .1); heroA = 1 - ease(eu); heroScale = 1 - .12 * eu; glow = 1;
            } else { heroA = 0; open = 1 - ease(clamp((tt - 4.55) / .3, 0, 1)); glow = open; }
            if (heroX === g.heroX && tt < 3.3) heroX = g.heroX;
            // düşmanlar
            ENEMIES.forEach(function (en, idx) {
                if (tt < en.ts || tt > en.te) return;
                var standX = g.heroX + 50, startX = g.doorX - 4, ex, ep, ea = 1, es = 1, er = 0, ey = 0;
                if (tt < en.ta) { var au = (tt - en.ts) / (en.ta - en.ts); ex = startX + (standX - startX) * au; ep = walkPose(tt * 10 + idx, -.05); ea = clamp((tt - en.ts) / .12, 0, 1); }
                else if (tt < en.th) { ex = standX; ep = mix(P.GUARD, P.STAND, .5); }
                else if (tt < en.tf) { var ru = (tt - en.th) / (en.tf - en.th); ex = standX + 14 * ease(ru); ep = P.HIT; if (!en.hit) { en.hit = true; flash(standX - 6, g.ground - 42); } }
                else {
                    var tu = clamp((tt - en.tf) / (en.te - en.tf), 0, 1), k = Math.pow(tu, 1.5), x0 = standX + 14, y0 = g.ground - 38;
                    if (!en.thr) { en.thr = true; flash(standX, g.ground - 30); }
                    var tx = W * (.5 + en.side * .2), ty = H * .38;
                    ex = x0 + (tx - x0) * k; ey = (ty - y0) * k; es = 1 + (en.maxS - 1) * Math.pow(tu, 2.2); er = en.side * tu * 5.5 * (idx % 2 ? -1 : 1);
                    ea = tu > .78 ? 1 - (tu - .78) / .22 : 1; ep = P.FLAIL;
                    enemies.push({ x: ex, y: g.ground - 38 + ey, s: es, rot: er, a: ea, pose: ep, ghost: true, tu: tu, front: true });
                    return;
                }
                enemies.push({ x: ex, y: g.ground, s: es, rot: er, a: ea, pose: ep, ghost: false, front: false });
            });
            if (tt > 4.75 && !scene.finished) { scene.finished = true; if (scene.doneCb) scene.doneCb(); }
        }
        // kapı ve kahraman (kapı en arkada)
        drawDoor(g, open, glow);
        // yakındaki (kart içi) düşmanlar önce
        enemies.forEach(function (en) { if (en.front) return; sctx.save(); sctx.translate(en.x, en.y); figure(sctx, en.pose, -1, ENEMY_COL, 2.4, en.a); sctx.restore(); });
        if (heroA > .01) { sctx.save(); sctx.translate(heroX, g.ground); sctx.scale(heroScale, heroScale); figure(sctx, heroPose, heroDir, HERO_COL, 2.6, heroA); sctx.restore(); }
        sctx.restore();
        // çarpma ışıkları
        for (var f = scene.flashes.length - 1; f >= 0; f--) {
            var fx = scene.flashes[f]; fx.age += dt; if (fx.age > .3) { scene.flashes.splice(f, 1); continue; }
            var fu = fx.age / .3; sctx.save(); sctx.globalAlpha = 1 - fu; sctx.strokeStyle = '#fff'; sctx.lineWidth = 2;
            sctx.beginPath(); sctx.arc(fx.x, fx.y, 6 + fu * 26, 0, 6.283); sctx.stroke();
            for (var r = 0; r < 7; r++) { var an = r * .9 + 1.1, r1 = 8 + fu * 14, r2 = 14 + fu * 30; sctx.beginPath(); sctx.moveTo(fx.x + Math.cos(an) * r1, fx.y + Math.sin(an) * r1); sctx.lineTo(fx.x + Math.cos(an) * r2, fx.y + Math.sin(an) * r2); sctx.stroke(); }
            sctx.restore();
        }
        // ekrana doğru fırlayan adamlar (kartın üstünde, büyüyerek)
        enemies.forEach(function (en) {
            if (!en.front) return;
            for (var gI = 3; gI >= 0; gI--) {
                var back = gI * .05, kk = Math.max(0, en.tu - back);
                var kp = Math.pow(kk, 1.5);
                var ghostA = gI === 0 ? en.a : en.a * .16 / gI;
                sctx.save();
                var gx = en.x - (en.x - (g.heroX + 64)) * (back * 4), gy = en.y + (gI * 6);
                sctx.translate(gI === 0 ? en.x : gx, gI === 0 ? en.y : gy); sctx.rotate(en.rot); sctx.scale(en.s * (1 - gI * .04), en.s * (1 - gI * .04)); sctx.translate(0, 38);
                figure(sctx, en.pose, -1, ENEMY_COL, 2.6, ghostA); sctx.restore();
            }
        });
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
        if (!document.hidden) { drawBg(dt); drawScene(dt); }
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
        success: function (name, done) {
            var ov = document.getElementById('fxWelcomeOverlay'), finished = false;
            var nm = String(name || '').trim();
            try { nm = nm.charAt(0).toLocaleUpperCase('tr-TR') + nm.slice(1); } catch (_) {}
            var go = function () {
                if (finished) return; finished = true;
                document.removeEventListener('keydown', skip); document.removeEventListener('pointerdown', skip);
                if (ov) { document.getElementById('fxName').textContent = nm; ov.classList.add('show'); }
                setTimeout(function () { if (done) done(); }, reduce ? 400 : 700);
            };
            var skip = function () { go(); };
            if (reduce || !sctx || !geom()) { go(); return; }
            scene.mode = 'fight'; scene.t0 = t; scene.armed = 0; scene.finished = false; scene.doneCb = go;
            ENEMIES.forEach(function (en) { en.hit = false; en.thr = false; });
            setTimeout(function () { document.addEventListener('keydown', skip); document.addEventListener('pointerdown', skip); }, 350);
        }
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
