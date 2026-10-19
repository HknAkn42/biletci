/* BiletPro giriş efektleri: sahne ışıkları + parıltılar (yazdıkça canlanır), konfeti kutlaması. Dış kütüphane yok. */
(function () {
    'use strict';
    var reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}
    var cv = document.getElementById('fxCanvas');
    var ctx = cv && cv.getContext ? cv.getContext('2d') : null;
    var W = 0, H = 0, dpr = 1, energy = 0.15, celebrating = 0, last = 0, t = 0;
    var dots = [], sparks = [], conf = [];
    var beams = [
        { x: .16, c: '124,58,237', ph: 0.0, sp: .34 },
        { x: .50, c: '59,130,246', ph: 2.0, sp: .27 },
        { x: .84, c: '236,72,153', ph: 4.0, sp: .39 },
        { x: .33, c: '251,191,36', ph: 1.1, sp: .22 },
        { x: .67, c: '34,211,238', ph: 3.2, sp: .30 }
    ];
    var COLORS = ['#fbbf24', '#f472b6', '#a78bfa', '#22d3ee', '#ffffff', '#fb7185', '#34d399'];
    var rnd = function (a, b) { return a + Math.random() * (b - a); };

    function resize() {
        if (!cv) return;
        dpr = Math.min(2, window.devicePixelRatio || 1);
        W = window.innerWidth; H = window.innerHeight;
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        var n = W < 640 ? 34 : 64;
        dots = [];
        for (var i = 0; i < n; i++) dots.push({ x: rnd(0, W), y: rnd(0, H), r: rnd(3, 14), vy: rnd(6, 24), vx: rnd(-8, 8), ph: rnd(0, 6.28), c: COLORS[i % 4] });
    }

    function spark(x, y, n, colors) {
        for (var i = 0; i < n; i++) {
            if (sparks.length > 160) sparks.shift();
            sparks.push({ x: x, y: y, vx: rnd(-130, 130), vy: rnd(-230, -40), life: rnd(.7, 1.3), age: 0, s: rnd(1.6, 3.8), c: (colors || COLORS)[(Math.random() * (colors || COLORS).length) | 0] });
        }
    }
    function burst(x, y, n, ang, spread, speed) {
        for (var i = 0; i < n; i++) {
            if (conf.length > 320) conf.shift();
            var a = ang + rnd(-spread, spread), v = rnd(speed * .45, speed);
            conf.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, w: rnd(6, 12), h: rnd(4, 8), rot: rnd(0, 6.28), vr: rnd(-9, 9), age: 0, life: rnd(2.6, 4.2), c: COLORS[(Math.random() * COLORS.length) | 0], round: Math.random() < .25 });
        }
    }

    function frame(ts) {
        if (!ctx) return;
        var dt = Math.min(.05, (ts - last) / 1000 || .016); last = ts; t += dt;
        if (!document.hidden) {
            ctx.clearRect(0, 0, W, H);
            energy *= Math.pow(.38, dt);
            var e = Math.max(energy, celebrating ? .9 : 0, .12);
            // sahne ışıkları
            ctx.globalCompositeOperation = 'lighter';
            for (var i = 0; i < beams.length; i++) {
                var b = beams[i], ang = Math.sin(t * b.sp * (1 + e) + b.ph) * .38;
                var a = .07 + e * .17, len = H * 1.3, spread = Math.max(110, W * .1);
                ctx.save(); ctx.translate(b.x * W, -30); ctx.rotate(ang);
                var g = ctx.createLinearGradient(0, 0, 0, len);
                g.addColorStop(0, 'rgba(' + b.c + ',' + a + ')'); g.addColorStop(1, 'rgba(' + b.c + ',0)');
                ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.lineTo(spread, len); ctx.lineTo(-spread, len); ctx.closePath(); ctx.fill();
                ctx.restore();
            }
            // yüzen ışık topları
            for (var d = 0; d < dots.length; d++) {
                var o = dots[d];
                o.y -= o.vy * (1 + e * 3) * dt; o.x += o.vx * dt;
                if (o.y < -20) { o.y = H + 20; o.x = rnd(0, W); }
                var al = (.16 + .14 * Math.sin(t * 1.4 + o.ph)) * (1 + e * 1.6);
                var rg = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r * 2.4);
                rg.addColorStop(0, o.c + Math.min(255, Math.round(al * 255)).toString(16).padStart(2, '0')); rg.addColorStop(1, o.c + '00');
                ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 2.4, 0, 6.283); ctx.fill();
            }
            ctx.globalCompositeOperation = 'source-over';
            // parıltılar
            for (var s = sparks.length - 1; s >= 0; s--) {
                var p = sparks[s]; p.age += dt;
                if (p.age > p.life) { sparks.splice(s, 1); continue; }
                p.vy += 320 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
                ctx.globalAlpha = 1 - p.age / p.life; ctx.fillStyle = p.c;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 6.283); ctx.fill();
            }
            // konfeti
            for (var k = conf.length - 1; k >= 0; k--) {
                var c = conf[k]; c.age += dt;
                if (c.age > c.life || c.y > H + 40) { conf.splice(k, 1); continue; }
                c.vy += 560 * dt; c.vx *= Math.pow(.55, dt); c.vy *= Math.pow(.8, dt); c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
                ctx.globalAlpha = c.age > c.life - .8 ? Math.max(0, (c.life - c.age) / .8) : 1;
                ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot); ctx.scale(1, Math.abs(Math.cos(c.rot * 1.3)) * .8 + .2); ctx.fillStyle = c.c;
                if (c.round) { ctx.beginPath(); ctx.arc(0, 0, c.w / 2.4, 0, 6.283); ctx.fill(); } else ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
                ctx.restore();
            }
            ctx.globalAlpha = 1;
        }
        requestAnimationFrame(frame);
    }

    // "Hoş geldiniz" harf harf belirir
    function letters(el, text, step, startDelay) {
        el.innerHTML = '';
        Array.prototype.forEach.call(text, function (ch, i) {
            var s = document.createElement('span');
            if (ch === ' ') s.className = 'sp';
            s.textContent = ch === ' ' ? ' ' : ch;
            s.style.animationDelay = (startDelay + i * step) + 's';
            el.appendChild(s);
        });
    }

    function pulseCard() {
        var card = document.getElementById('terminal'); if (!card) return;
        card.classList.add('fx-pulse');
        clearTimeout(pulseCard._t); pulseCard._t = setTimeout(function () { card.classList.remove('fx-pulse'); }, 260);
    }

    function onType(e) {
        energy = Math.min(1, energy + .26);
        pulseCard();
        var el = e.target, r = el.getBoundingClientRect();
        spark(r.left + r.width * rnd(.08, .92), r.top + r.height * .5, 3, ['#fbbf24', '#a78bfa', '#f472b6', '#ffffff']);
    }

    var api = {
        pulse: function () { energy = Math.min(1, energy + .5); },
        fail: function () {
            energy = 1;
            var card = document.getElementById('terminal');
            if (card) { card.classList.remove('fx-fail'); void card.offsetWidth; card.classList.add('fx-fail'); setTimeout(function () { card.classList.remove('fx-fail'); }, 520); }
            var r = card ? card.getBoundingClientRect() : { left: W / 2, top: H / 2, width: 0, height: 0 };
            spark(r.left + r.width / 2, r.top + r.height / 2, 26, ['#ef4444', '#f87171', '#fb7185']);
        },
        success: function (name) {
            var ov = document.getElementById('fxWelcomeOverlay'); if (!ov) return;
            var nm = String(name || '').trim();
            try { nm = nm.charAt(0).toLocaleUpperCase('tr-TR') + nm.slice(1); } catch (_) {}
            letters(document.getElementById('fxName'), nm + '!', .06, .55);
            ov.classList.add('show');
            if (reduce || !ctx) return;
            celebrating = 1; energy = 1;
            burst(W * .08, H + 10, 110, -Math.PI / 2 + .55, .45, H * 1.25);
            burst(W * .92, H + 10, 110, -Math.PI / 2 - .55, .45, H * 1.25);
            setTimeout(function () { burst(W * .5, H * .5, 140, -Math.PI / 2, Math.PI, 760); spark(W / 2, H / 2, 40); }, 480);
            setTimeout(function () { burst(W * .25, H * .2, 70, Math.PI / 2, 1.2, 420); burst(W * .75, H * .2, 70, Math.PI / 2, 1.2, 420); }, 950);
        }
    };
    window.LoginFX = api;

    function init() {
        var wl = document.getElementById('fxWelcome');
        if (wl) letters(wl, 'Hoş geldiniz', .055, .45);
        ['username', 'password'].forEach(function (id) {
            var el = document.getElementById(id); if (!el) return;
            el.addEventListener('input', onType);
            el.addEventListener('focus', function () { energy = Math.max(energy, .55); });
        });
        var btn = document.getElementById('loginBtn');
        if (btn) btn.addEventListener('pointerdown', function (e) {
            var r = btn.getBoundingClientRect(), s = document.createElement('span'), d = Math.max(r.width, r.height);
            s.className = 'fx-ripple'; s.style.width = s.style.height = d + 'px';
            s.style.left = (e.clientX - r.left - d / 2) + 'px'; s.style.top = (e.clientY - r.top - d / 2) + 'px';
            btn.appendChild(s); setTimeout(function () { s.remove(); }, 700);
            energy = 1; spark(e.clientX, e.clientY, 12);
        });
        if (ctx && !reduce) { resize(); window.addEventListener('resize', resize); requestAnimationFrame(frame); }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
