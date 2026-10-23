/* BiletPro | BAKIM MODU
   Her sayfanın <head> bölümünde EN ÜSTTE yüklenir. Açıkken sayfanın geri kalanı hiç yüklenmez
   (window.stop) ve herkese (yönetici dahil) bakım ekranı gösterilir.
   AÇMAK / KAPATMAK için yalnızca aşağıdaki satırı değiştirin: true = bakımda, false = normal. */
(function () {
    var BAKIM_AKTIF = true;
    if (!BAKIM_AKTIF) return;

    try { window.stop(); } catch (_) {}

    var html = '' +
    '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
    '<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#14103f">' +
    '<title>Bakımdayız | BiletPro</title>' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">' +
    '<style>' +
    '*{box-sizing:border-box;margin:0;padding:0}' +
    'html,body{height:100%}' +
    'html{background:#0a0b1f}body{min-height:100vh;min-height:100dvh;display:flex;padding:24px;overflow-x:hidden;overflow-y:auto;background-attachment:fixed;color:#fff;font-family:Inter,system-ui,sans-serif;' +
    'background:radial-gradient(900px 600px at 15% 10%,#6b46ff 0%,transparent 60%),radial-gradient(800px 600px at 90% 90%,#ff4fa3 0%,transparent 55%),linear-gradient(160deg,#14103f 0%,#241a6e 50%,#0a0b1f 100%);}' +
    'body::before{content:"";position:fixed;inset:0;background-image:radial-gradient(rgba(255,255,255,.12) 1px,transparent 1px);background-size:28px 28px;mask-image:radial-gradient(circle at 50% 40%,#000,transparent 75%);-webkit-mask-image:radial-gradient(circle at 50% 40%,#000,transparent 75%);pointer-events:none}' +
    '.orb{position:fixed;border-radius:50%;filter:blur(70px);opacity:.5;pointer-events:none;animation:drift 14s ease-in-out infinite alternate}' +
    '.o1{width:380px;height:380px;background:#5b4bff;top:-120px;right:-80px}' +
    '.o2{width:320px;height:320px;background:#ff4fa3;bottom:-120px;left:8%;animation-delay:-7s}' +
    '@keyframes drift{to{transform:translate(50px,-40px) scale(1.18)}}' +
    '.card{position:relative;margin:auto;width:100%;max-width:720px;text-align:center;padding:48px 36px 36px;border-radius:36px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);' +
    'backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);box-shadow:0 40px 90px -30px rgba(5,3,40,.8);animation:rise .9s cubic-bezier(.2,.8,.2,1) both}' +
    '@keyframes rise{from{opacity:0;transform:translateY(24px) scale(.97)}to{opacity:1;transform:none}}' +
    '.gears{position:relative;width:132px;height:112px;margin:0 auto 26px}' +
    '.gears svg{position:absolute;fill:none;stroke:#fff;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}' +
    '.g1{width:84px;height:84px;left:0;top:14px;animation:spin 7s linear infinite;stroke:#d9ccff}' +
    '.g2{width:62px;height:62px;right:4px;top:0;animation:spin 5.2s linear infinite reverse;stroke:#ffc2e4}' +
    '@keyframes spin{to{transform:rotate(360deg)}}' +
    '.tag{display:inline-flex;align-items:center;gap:9px;padding:7px 16px;border-radius:99px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#e6defe}' +
    '.dot{width:9px;height:9px;border-radius:50%;background:#ffc86b;box-shadow:0 0 0 0 rgba(255,200,107,.7);animation:pulse 1.6s infinite}' +
    '@keyframes pulse{70%{box-shadow:0 0 0 12px rgba(255,200,107,0)}100%{box-shadow:0 0 0 0 rgba(255,200,107,0)}}' +
    'h1{font-family:"Plus Jakarta Sans",Inter,sans-serif;font-weight:800;letter-spacing:-.04em;line-height:1.02;font-size:clamp(46px,11vw,92px);margin:20px 0 18px;' +
    'background:linear-gradient(90deg,#fff 10%,#e3d7ff 55%,#ffc2e4 100%);-webkit-background-clip:text;background-clip:text;color:transparent}' +
    '.lead{font-family:"Plus Jakarta Sans",Inter,sans-serif;font-weight:700;font-size:clamp(20px,3.6vw,28px);line-height:1.3;letter-spacing:-.01em;color:#fff;max-width:560px;margin:0 auto 14px}' +
    '.sub{font-size:clamp(15px,2.4vw,17.5px);line-height:1.65;color:rgba(255,255,255,.78);max-width:540px;margin:0 auto}' +
    '.sub b{color:#fff;font-weight:600}' +
    '.steps{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin:28px 0 24px}' +
    '.step{display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border-radius:14px;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.16);font-size:14px;font-weight:500;color:#f1ecff}' +
    '.step i{font-style:normal;width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:12px;background:rgba(255,255,255,.18)}' +
    '.step.run i{background:transparent;border:2.5px solid rgba(255,255,255,.35);border-top-color:#fff;animation:spin .8s linear infinite}' +
    '.step.ok i{background:#3ddc97;color:#06281a;font-weight:800}' +
    '.bar{height:8px;border-radius:99px;background:rgba(255,255,255,.14);overflow:hidden;max-width:460px;margin:0 auto 28px}' +
    '.bar::after{content:"";display:block;height:100%;width:38%;border-radius:99px;background:linear-gradient(90deg,#8a6bff,#ff4fa3);animation:load 2.1s ease-in-out infinite}' +
    '@keyframes load{0%{transform:translateX(-110%)}100%{transform:translateX(290%)}}' +
    '.contact{display:flex;align-items:center;justify-content:center;gap:12px;max-width:520px;margin:0 auto 24px;padding:14px 18px;border-radius:18px;background:rgba(255,255,255,.1);border:1px dashed rgba(255,255,255,.34);font-size:15px;line-height:1.5;color:#fff;text-align:left}' +
    '.contact svg{flex-shrink:0;width:26px;height:26px;stroke:#ffd9ef;fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}' +
    'button{font:inherit;cursor:pointer;min-height:50px;padding:0 26px;border:0;border-radius:16px;background:#fff;color:#2a1a78;font-weight:700;font-size:15.5px;box-shadow:0 14px 30px -12px rgba(0,0,0,.5);transition:transform .15s}' +
    'button:hover{transform:translateY(-2px)} button:active{transform:scale(.97)}' +
    '.foot{margin-top:22px;font-size:13px;color:rgba(255,255,255,.55)}' +
    '@media (max-width:520px){.card{padding:36px 20px 28px;border-radius:28px}.contact{text-align:left;font-size:14px}}' +
    '@media (prefers-reduced-motion:reduce){*{animation:none!important}}' +
    '</style></head>' +
    '<body><div class="orb o1"></div><div class="orb o2"></div>' +
    '<main class="card" role="alert" aria-live="polite">' +
      '<div class="gears" aria-hidden="true">' +
        '<svg class="g1" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/><circle cx="12" cy="12" r="6.6"/></svg>' +
        '<svg class="g2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1"/><circle cx="12" cy="12" r="6.3"/></svg>' +
      '</div>' +
      '<span class="tag"><span class="dot"></span>Planlı bakım</span>' +
      '<h1>Bakımdayız</h1>' +
      '<p class="lead">Güncelleme ve yedekleme çalışmaları yapılıyor.</p>' +
      '<p class="sub">Sistemi sizin için daha hızlı ve güvenli hale getiriyoruz. <b>Verileriniz güvende</b>; çalışmalar bitince panel otomatik olarak yeniden açılacak.</p>' +
      '<div class="steps" aria-hidden="true">' +
        '<span class="step ok"><i>✓</i>Veriler korumaya alındı</span>' +
        '<span class="step run"><i></i>Yedekleme sürüyor</span>' +
        '<span class="step run"><i></i>Güncelleme yapılıyor</span>' +
      '</div>' +
      '<div class="bar" aria-hidden="true"></div>' +
      '<div class="contact"><svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg><span><b>Acil bir durumda</b> yöneticinizle iletişime geçebilirsiniz.</span></div>' +
      '<button type="button" onclick="location.reload()">Tekrar dene</button>' +
      '<p class="foot">BiletPro · Anlayışınız için teşekkür ederiz</p>' +
    '</main></body>';

    document.documentElement.innerHTML = html;

    // Bakım bitince (anahtar kapatılınca) sayfa kendiliğinden açılsın: dakikada bir yeniden dene
    setTimeout(function () { location.reload(); }, 60000);
})();
