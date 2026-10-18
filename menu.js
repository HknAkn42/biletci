/* Tema: boyamadan önce uygula (kayıtlı seçim yoksa açık tema) */
(function(){ try { var t = localStorage.getItem("BiletPro_Theme") || (localStorage.getItem("BiletPro_DarkMode") === "1" ? "dark" : "light"); document.documentElement.setAttribute("data-theme", t === "dark" ? "dark" : "light"); } catch (_) { document.documentElement.setAttribute("data-theme", "light"); } })();
/* Kimlik: Supabase Auth oturumunu (localStorage 'biletpro-auth') eşzamanlı okur.
   Rol ve kullanıcı adı yalnızca imzalı belirteçten (JWT) türetilir; BiletPro_Session içindeki rol alanına güvenilmez.
   Gerçek yetki denetimi veritabanında RLS ile yapılır; bu okuyucu arayüzü yönlendirmek içindir. */
window.BiletProAuth = {
    STORAGE_KEY: 'biletpro-auth',
    read() {
        try {
            const raw = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || 'null');
            if (!raw || !raw.access_token || !raw.refresh_token) return null;
            const payload = JSON.parse(decodeURIComponent(escape(atob(raw.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))));
            const email = String((payload.email || (raw.user && raw.user.email) || '')).toLowerCase();
            const username = String((payload.user_metadata && payload.user_metadata.username) || email.split('@')[0] || '').toLowerCase();
            const role = String((payload.app_metadata && payload.app_metadata.app_role) || 'staff').toLowerCase() === 'admin' ? 'admin' : 'staff';
            return { username, role, email, exp: payload.exp || 0, expiresAt: raw.expires_at || payload.exp || 0 };
        } catch (_) { return null; }
    },
    clear() { try { localStorage.removeItem(this.STORAGE_KEY); } catch (_) {} }
};

/**
 * BiletPro | Crystal Silk Official Guard v18.2 (Premium UI + Müşteriler + BİLET SATIŞ)
 */

// localStorage intercept: kritik anahtarlar yazılınca anında Supabase push tetikle
(function() {
    const _origSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(key, value) {
        const prevValue = localStorage.getItem(key);
        _origSetItem(key, value);
        if (key === 'EventPro_DB_Ultimate_Final') {
            if (window.__bpSkipAutoPush) return;
            if ((prevValue || '') === (value || '')) return;
            // Kısa gecikmeyle push et (aynı tick'te birden fazla yazma varsa birleşsin)
            clearTimeout(window.__bpSyncTimer);
            window.__bpSyncTimer = setTimeout(() => {
                try {
                    if (window.BiletProOnlineStore && window.BiletProOnlineStore.getMode() === 'online') {
                        const prevEvents = JSON.parse(prevValue || '[]');
                        const events = JSON.parse(value || '[]');

                        const prevIds = new Set((Array.isArray(prevEvents) ? prevEvents : []).map(e => String(e && e.id)).filter(Boolean));
                        const newIds = new Set((Array.isArray(events) ? events : []).map(e => String(e && e.id)).filter(Boolean));
                        const deletedIds = Array.from(prevIds).filter(id => !newIds.has(id));

                        if (deletedIds.length && typeof window.BiletProOnlineStore.markEventsDeleted === 'function') {
                            window.BiletProOnlineStore.markEventsDeleted(deletedIds).catch(() => {});
                            if (typeof window.BiletProOnlineStore.deleteLegacyEventBundle === 'function') {
                                deletedIds.forEach((id) => window.BiletProOnlineStore.deleteLegacyEventBundle(id).catch(() => {}));
                            }
                        }

                        events.forEach(ev => {
                            if (ev && ev.id) {
                                window.BiletProOnlineStore.syncLegacyEventBundle(ev).catch(() => {});
                            }
                        });
                    }
                } catch(e) {}
            }, 400);
        }

        if (key === 'BiletPro_Config') {
            if (window.__bpSkipConfigPush) return;
            if ((prevValue || '') === (value || '')) return;
            clearTimeout(window.__bpConfigSyncTimer);
            window.__bpConfigSyncTimer = setTimeout(() => {
                try {
                    if (window.BiletProOnlineStore && window.BiletProOnlineStore.getMode() === 'online' && typeof window.BiletProOnlineStore.pushConfigToOnline === 'function') {
                        const cfg = JSON.parse(value || '{}');
                        window.BiletProOnlineStore.pushConfigToOnline(cfg).catch(() => {});
                    }
                } catch(_) {}
            }, 250);
        }
    };
})();

(function() {
    function safeJSONParse(raw, fallback = null) {
        try { return JSON.parse(raw); } catch(_) { return fallback; }
    }

    function normalizeUsername(value) {
        return String(value || '').trim().toLowerCase();
    }

    function hasRequiredPermission(user, page) {
        if(!user) return false;
        if(page === 'settings.html') return false; // settings yalnızca admin
        if(page === 'duzen.html') return false;    // oturma düzeni düzenleme yalnızca admin
        const username = (user.username || '').toLowerCase();
        const isAdmin = user.role === 'admin';
        if(isAdmin) return true;

        const perms = user.perms || {};
        // Kritik kural: Mimari/Gişe yalnızca yüksek yetkili kullanıcılar için
        // (admin zaten üstte true döndü)
        if (page === 'gise.html') {
            return perms.pManageEvents === true && (perms.pManageStaff === true || perms.pReports === true);
        }

        const pagePermMap = {
            'index.html': null, // Dashboard: herkes görebilir, yönetim butonları index.html içinde kontrol edilir
            'gise.html': 'pManageEvents',
            'satis.html': 'pSale',
            'musteriler.html': 'pSale',
            'checkin.html': 'pDoor',
            'masalar.html': 'pDoor',
            'personel.html': 'pManageStaff',
            'rapor.html': 'pReports',
            'settings.html': 'pManageStaff'
        };

        const requiredPerm = pagePermMap[page];
        if(!requiredPerm) return true;
        return perms[requiredPerm] === true;
    }

    function getFirstAllowedPage(user) {
        if (!user) return null;
        // Dashboard (index.html) herkese açık; etkinlik seçim merkezi
        return 'index.html';
    }

    // 1. OTURUM KONTROLÜ
    let session = safeJSONParse(localStorage.getItem('BiletPro_Session'));
    const path = window.location.pathname;
    const rawPage = path.split("/").pop();
    const currentPage = rawPage && rawPage.trim() ? rawPage.trim() : 'index.html';

    // Tarayıcı/sekme kapatılıp tekrar açıldıysa sessionStorage boş olur → oturumu sil
    if (session && currentPage !== 'login.html' && !sessionStorage.getItem('BiletPro_LoggedInTab')) {
        localStorage.removeItem('BiletPro_Session');
        localStorage.removeItem('BiletPro_LastActivity');
        session = null;
    }

    // Supabase oturumu (JWT) yoksa yerel oturum geçersizdir.
    const __auth = window.BiletProAuth && window.BiletProAuth.read();
    if (currentPage !== 'login.html' && !__auth) {
        localStorage.removeItem('BiletPro_Session');
        session = null;
    }

    if (!session && currentPage !== 'login.html') {
        window.location.href = 'login.html';
        return;
    }

    // Rol ve kullanıcı adı belirteçten gelir; yerel oturumu buna eşitle
    if (session && __auth && currentPage !== 'login.html') {
        if (normalizeUsername(session.username) !== __auth.username || String(session.role || '').toLowerCase() !== __auth.role) {
            session.username = __auth.username;
            session.role = __auth.role;
            localStorage.setItem('BiletPro_Session', JSON.stringify(session));
        }
    }

    // Aktif sekme işareti (her sayfa yüklemesinde yenile)
    if (session && currentPage !== 'login.html') {
        sessionStorage.setItem('BiletPro_LoggedInTab', '1');
    }

    // Bir yönetici hesabı asla tarayıcı tarafında otomatik oluşturulmaz.
    // Böyle bir "bootstrap" hesap, tarayıcı verisi silindiğinde yetkisiz erişim sağlar.
    let staffData = safeJSONParse(localStorage.getItem('BiletPro_Staff'), []) || [];

    // 2. OTURUM KULLANICISI GERÇEKTEN VAR MI / AKTİF Mİ / YETKİLİ Mİ?
    if (session && currentPage !== 'login.html') {
        const sessionUsername = normalizeUsername(session.username);
        const sessionRole = String(session.role || '').trim().toLowerCase();
        const currentUser = staffData.find(
            s => normalizeUsername(s && s.username) === sessionUsername
        );

        const currentUserRole = String((currentUser && currentUser.role) || '').trim().toLowerCase();
        const isSessionAdmin = !!(__auth && __auth.role === 'admin');

        if (!isSessionAdmin) {
            const isAllowed = currentUser && currentUser.isActive !== false && hasRequiredPermission(currentUser, currentPage);
            if (!isAllowed) {
                const fallbackPage = getFirstAllowedPage(currentUser);
                sessionStorage.setItem('BiletPro_AccessDeniedMsg', 'GİRİŞ YASAK: Bu sayfa için yetkiniz yok.');

                if (fallbackPage && fallbackPage !== currentPage) {
                    window.location.href = fallbackPage;
                    return;
                }

                // Hiç yetkili sayfa yoksa güvenli şekilde login'e yönlendir.
                localStorage.removeItem('BiletPro_Session');
                window.location.href = 'login.html';
                return;
            }
        }
    }
})();

/* ==========================================
   OTOMATİK ÇIKIŞ — 30 DAKİKA İNAKTİVİTE
   ========================================== */
(function() {
    const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 dakika (ms)
    const STORAGE_KEY = 'BiletPro_LastActivity';
    const currentPage = (window.location.pathname.split("/").pop() || '').trim() || 'index.html';

    // Login sayfasında zamanlayıcı çalışmasın
    if (currentPage === 'login.html') return;

    function updateActivity() {
        localStorage.setItem(STORAGE_KEY, Date.now().toString());
    }

    function checkIdle() {
        const last = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
        if (last && (Date.now() - last > IDLE_TIMEOUT)) {
            localStorage.removeItem('BiletPro_Session');
            localStorage.removeItem(STORAGE_KEY);
            window.BiletProAuth && window.BiletProAuth.clear();
            alert('⏱️ 30 dakika hareketsizlik nedeniyle oturumunuz sonlandırıldı. Lütfen tekrar giriş yapın.');
            window.location.href = 'login.html';
        }
    }

    // Sayfa açılışında son aktiviteyi kontrol et
    checkIdle();

    // Aktiviteyi kaydeden olaylar
    ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'].forEach(evt => {
        document.addEventListener(evt, updateActivity, { passive: true });
    });

    // İlk aktivite kaydı
    updateActivity();

    // Her 60 saniyede bir kontrol
    setInterval(checkIdle, 60 * 1000);
})();

/* ==========================================
   GLOBAL CONFIG CORE (TEK NOKTADAN YÖNETİM)
   ========================================== */
const BILETPRO_DEFAULT_CONFIG = {
    brand: {
        appName: 'BiletPro',
        shortName: 'BILETPRO',
        subtitle: 'GÜVENLİ ERİŞİM SİSTEMİ',
        logoUrl: '',
        primaryColor: '#2563eb'
    },
    online: {
        enabled: true,
        provider: 'supabase',
        supabaseUrl: 'https://xlwmzalusrhhmxbvrmdx.supabase.co',
        supabaseAnonKey: 'sb_publishable_lYENVrZ-QIKlDSyzorUN1g_0qOELxt9',
        projectRef: 'xlwmzalusrhhmxbvrmdx'
    },
    menuLabels: {
        dashboard: 'DASHBOARD',
        gise: 'GİŞE & MİMARİ',
        satis: 'BİLET SATIŞ',
        musteriler: 'MÜŞTERİLER',
        checkin: 'KAPI KONTROL',
        personel: 'PERSONEL',
        report: 'RAPORLAR',
        settings: 'SİSTEM AYARLARI'
    },
    menuVisibility: {
        dashboard: true,
        gise: true,
        satis: true,
        musteriler: true,
        checkin: true,
        personel: true,
        report: true,
        settings: true
    },
    security: {
        settingsPin: ''
    }
};

function safeJSON(raw, fallback = null) {
    try { return JSON.parse(raw); } catch(_) { return fallback; }
}

function bpEscapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function bpEscapeAttr(value) {
    return bpEscapeHtml(value).replace(/`/g, '&#96;');
}

window.BiletProSecurity = {
    escapeHtml: bpEscapeHtml,
    escapeAttr: bpEscapeAttr,
    async hashPassword(password) {
        if (!window.crypto?.subtle) throw new Error('secure_crypto_unavailable');
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, material, 256);
        const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));
        return `pbkdf2$210000$${toB64(salt)}$${toB64(new Uint8Array(bits))}`;
    },
    async verifyPassword(stored, candidate) {
        const value = String(stored || '');
        if (!value.startsWith('pbkdf2$')) return { ok: value === String(candidate), legacy: true };
        const [, iterations, saltB64, hashB64] = value.split('$');
        try {
            const fromB64 = (input) => Uint8Array.from(atob(input), c => c.charCodeAt(0));
            const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(candidate)), 'PBKDF2', false, ['deriveBits']);
            const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromB64(saltB64), iterations: Number(iterations), hash: 'SHA-256' }, material, 256));
            const expected = fromB64(hashB64);
            if (bits.length !== expected.length) return { ok: false, legacy: false };
            let difference = 0;
            for (let i = 0; i < bits.length; i++) difference |= bits[i] ^ expected[i];
            return { ok: difference === 0, legacy: false };
        } catch (_) { return { ok: false, legacy: false }; }
    }
};

function mergeDeep(base, override) {
    const output = Array.isArray(base) ? [...base] : { ...base };
    if(!override || typeof override !== 'object') return output;
    Object.keys(override).forEach(key => {
        const bv = output[key];
        const ov = override[key];
        if(bv && typeof bv === 'object' && !Array.isArray(bv) && ov && typeof ov === 'object' && !Array.isArray(ov)) {
            output[key] = mergeDeep(bv, ov);
        } else {
            output[key] = ov;
        }
    });
    return output;
}

window.BiletProCore = {
    getConfig() {
        const raw = safeJSON(localStorage.getItem('BiletPro_Config'), {});
        const merged = mergeDeep(BILETPRO_DEFAULT_CONFIG, raw || {});

        // Eski sürümün bilinen varsayılan PIN'i artık geçerli bir güvenlik anahtarı değildir.
        if (merged.security?.settingsPin === '52655265') merged.security.settingsPin = '';

        // Canlı çoklu cihaz modu: eski localStorage config "enabled:false" bırakmış olsa bile online açık gelsin
        if (merged.online && merged.online.provider === 'supabase' && merged.online.supabaseUrl && merged.online.supabaseAnonKey) {
            merged.online.enabled = true;
        }

        return merged;
    },
    saveConfig(newConfig) {
        const merged = mergeDeep(BILETPRO_DEFAULT_CONFIG, newConfig || {});
        localStorage.setItem('BiletPro_Config', JSON.stringify(merged));
        return merged;
    },
    resetConfig() {
        localStorage.removeItem('BiletPro_Config');
        return mergeDeep({}, BILETPRO_DEFAULT_CONFIG);
    }
};

function syncDynamicViewportHeight() {
    try {
        const vv = window.visualViewport;
        const vh = (vv && vv.height ? vv.height : window.innerHeight) * 0.01;
        document.documentElement.style.setProperty('--bp-vh', `${vh}px`);
    } catch (_) {}
}

function initDynamicViewportHeight() {
    if (window.__bpDynamicVhReady) return;
    window.__bpDynamicVhReady = true;

    const update = () => syncDynamicViewportHeight();
    update();

    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('orientationchange', update, { passive: true });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') update();
    });

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', update, { passive: true });
        window.visualViewport.addEventListener('scroll', update, { passive: true });
    }
}

window.applyGlobalConfig = function() {
    const cfg = window.BiletProCore.getConfig();
    const brand = cfg.brand || {};

    const root = document.documentElement;
    if(root && brand.primaryColor) root.style.setProperty('--biletpro-primary', brand.primaryColor);

    if(document.title && document.title.includes('|')) {
        const right = document.title.split('|').slice(1).join('|').trim();
        document.title = `${brand.appName || 'BiletPro'} | ${right}`;
    }

    document.querySelectorAll('[data-brand-name]').forEach(el => {
        el.textContent = brand.appName || 'BiletPro';
    });
    document.querySelectorAll('[data-brand-short]').forEach(el => {
        el.textContent = brand.shortName || 'BILETPRO';
    });
    document.querySelectorAll('[data-brand-subtitle]').forEach(el => {
        el.textContent = brand.subtitle || 'GÜVENLİ ERİŞİM SİSTEMİ';
    });

    const logoTargets = ['headLogo', 'tkEventLogo', 'loginBrandLogo'];
    logoTargets.forEach(id => {
        const img = document.getElementById(id);
        if(!img) return;
        if(brand.logoUrl) {
            img.src = brand.logoUrl;
            img.classList.remove('hidden');
            const icon = document.getElementById('loginBrandIcon');
            if(icon) icon.classList.add('hidden');
        }
    });
};

/* ==========================================
   GLOBAL UI: TOAST & CONFIRM (PREMIUM UYARILAR)
   ========================================== */
const uiStyles = document.createElement('style');
uiStyles.innerHTML = `
    /* Toast Bildirimleri (Sağ üstten kayarak gelir) */
    .toast-container { position: fixed; top: max(12px, env(safe-area-inset-top)); right: 12px; z-index: 9999999; display: flex; flex-direction: column; gap: 12px; pointer-events: none; width: min(420px, calc(100vw - 24px)); }
    .toast-silk { 
        background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(20px); border: 1px solid rgba(226, 232, 240, 0.8); 
        padding: 16px 24px; border-radius: 20px; box-shadow: 0 15px 40px rgba(0,0,0,0.08); 
        display: flex; align-items: center; gap: 14px; transform: translateX(120%); opacity: 0; 
        transition: all 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55); font-family: 'Plus Jakarta Sans', sans-serif;
        position: relative; overflow: hidden; width: 100%;
    }
    .toast-silk.show { transform: translateX(0); opacity: 1; }
    .toast-icon { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 16px; flex-shrink: 0; }
    .toast-success .toast-icon { background: #dcfce7; color: #16a34a; }
    .toast-error .toast-icon { background: #fee2e2; color: #ef4444; }
    .toast-info .toast-icon { background: #e0e7ff; color: #4f46e5; }
    .toast-warning .toast-icon { background: #fef3c7; color: #d97706; }
    .toast-text { font-size: 13px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; flex: 1; }
    .toast-progress { position: absolute; bottom: 0; left: 0; height: 3px; width: 100%; border-radius: 0 0 20px 20px; transition: width 3.4s linear; }
    .toast-success .toast-progress { background: #16a34a; }
    .toast-error .toast-progress { background: #ef4444; }
    .toast-info .toast-progress { background: #4f46e5; }
    .toast-warning .toast-progress { background: #d97706; }

    /* Sayfa geçiş animasyonu (flash engeli) */
    @keyframes bpFadeIn { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:translateY(0); } }
    body.bp-ready { animation: bpFadeIn 260ms ease forwards; }
    body.bp-fading { opacity:0 !important; transition: opacity 160ms ease !important; pointer-events:none !important; }
    /* Senkronizasyon bildirimi */
    .bp-sync-pill { position:fixed; bottom:16px; left:50%; transform:translateX(-50%); background:rgba(15,23,42,0.88); color:#94a3b8; font-size:9px; font-weight:900; text-transform:uppercase; letter-spacing:1.5px; padding:5px 16px; border-radius:99px; opacity:0; transition:opacity 0.3s; pointer-events:none; z-index:9999997; white-space:nowrap; }
    .bp-sync-pill.show { opacity:1; }

    /* Confirm Kutusu (Ekranın ortasında cam efektli) */
    .confirm-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(10px); z-index: 9999999; display: flex; align-items: center; justify-content: center; opacity: 0; transition: 0.3s; pointer-events: none; padding: 12px; }
    .confirm-overlay.show { opacity: 1; pointer-events: all; }
    .confirm-box { background: #fff; border-radius: 36px; padding: 45px 35px; width: 100%; max-width: 400px; max-height: calc(100dvh - 24px); overflow: auto; text-align: center; box-shadow: 0 30px 60px rgba(0,0,0,0.15); transform: scale(0.95); transition: 0.3s cubic-bezier(0.16, 1, 0.3, 1); font-family: 'Plus Jakarta Sans', sans-serif; }
    .confirm-overlay.show .confirm-box { transform: scale(1); }
    .confirm-icon { width: 65px; height: 65px; background: #fee2e2; color: #ef4444; border-radius: 22px; display: flex; align-items: center; justify-content: center; font-size: 32px; margin: 0 auto 25px; font-weight: bold;}
    .confirm-title { font-size: 20px; font-weight: 900; color: #0f172a; margin-bottom: 12px; text-transform: uppercase; tracking-tight; }
    .confirm-desc { font-size: 13px; font-weight: 600; color: #64748b; margin-bottom: 35px; line-height: 1.6; }
    .confirm-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
    .btn-c-cancel { padding: 16px; border-radius: 18px; background: #f1f5f9; color: #475569; font-weight: 800; font-size: 11px; text-transform: uppercase; border: none; cursor: pointer; transition: 0.2s; }
    .btn-c-cancel:hover { background: #e2e8f0; }
    .btn-c-confirm { padding: 16px; border-radius: 18px; background: #ef4444; color: #fff; font-weight: 800; font-size: 11px; text-transform: uppercase; border: none; cursor: pointer; transition: 0.3s; box-shadow: 0 10px 25px rgba(239, 68, 68, 0.25); }
    .btn-c-confirm:hover { transform: translateY(-3px); box-shadow: 0 15px 30px rgba(239, 68, 68, 0.4); }

    @media (max-width: 640px) {
        .toast-container { left: 12px; right: 12px; width: auto; }
        .toast-silk { border-radius: 16px; padding: 12px 14px; gap: 10px; }
        .toast-text { font-size: 11px; }
        .confirm-box { border-radius: 22px; padding: 20px 16px; max-width: min(520px, calc(100vw - 24px)); }
        .confirm-actions { grid-template-columns: 1fr; }
    }
`;
document.head.appendChild(uiStyles);

window.addEventListener('DOMContentLoaded', () => {
    initDynamicViewportHeight();

    if (typeof window._syncThemeSwitch === "function") window._syncThemeSwitch();
    // Sayfa fade-in
    document.body.classList.add('bp-ready');
    // Sync pill
    const _syncPill = document.createElement('div');
    _syncPill.className = 'bp-sync-pill'; _syncPill.id = 'bpSyncPill'; _syncPill.textContent = '⟳ GÜNCELLENIYOR';
    document.body.appendChild(_syncPill);

    const toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    toastContainer.id = 'globalToastContainer';
    document.body.appendChild(toastContainer);

    if(typeof applyGlobalConfig === 'function') {
        applyGlobalConfig();
    }

    const deniedMsg = sessionStorage.getItem('BiletPro_AccessDeniedMsg');
    if (deniedMsg) {
        sessionStorage.removeItem('BiletPro_AccessDeniedMsg');
        setTimeout(() => {
            if (typeof window.showToast === 'function') {
                window.showToast(deniedMsg, 'error');
            }
        }, 120);
    }
});

// KULLANIM: showToast("İşlem Başarılı", "success") veya "error" / "info"
window.showToast = function(message, type = 'info') {
    const container = document.getElementById('globalToastContainer');
    if(!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-silk toast-${type}`;
    let iconHtml = 'ℹ️';
    if(type === 'success') iconHtml = '✅';
    if(type === 'error') iconHtml = '❌';
    if(type === 'warning') iconHtml = '⚠️';

    const pId = 'tp_' + Date.now();
    const safeMessage = bpEscapeHtml(message).replace(/\n/g, '<br>');
    toast.innerHTML = `<div class="toast-icon">${iconHtml}</div><div class="toast-text">${safeMessage}</div><div class="toast-progress" id="${pId}"></div>`;
    container.appendChild(toast);
    
    requestAnimationFrame(() => requestAnimationFrame(() => {
        toast.classList.add('show');
        const prog = document.getElementById(pId);
        if (prog) requestAnimationFrame(() => { prog.style.width = '0%'; });
    }));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
    }, 3500);
}

// KULLANIM: showConfirm("SİL?", "Emin misin?", () => { silme_kodları_buraya })
window.showConfirm = function(title, description, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    const safeTitle = bpEscapeHtml(title);
    const safeDescription = bpEscapeHtml(description).replace(/\n/g, '<br>');
    overlay.innerHTML = `
        <div class="confirm-box">
            <div class="confirm-icon">!</div>
            <div class="confirm-title">${safeTitle}</div>
            <div class="confirm-desc">${safeDescription}</div>
            <div class="confirm-actions">
                <button class="btn-c-cancel" onclick="this.closest('.confirm-overlay').remove()">VAZGEÇ</button>
                <button class="btn-c-confirm" id="confirmBtnAction">ONAYLA VE SİL</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    
    requestAnimationFrame(() => overlay.classList.add('show'));

    document.getElementById('confirmBtnAction').onclick = () => {
        overlay.classList.remove('show');
        setTimeout(() => {
            overlay.remove();
            if(onConfirm) onConfirm();
        }, 300);
    };
}

// SYSTEM AUDIT LOG (GLOBAL)
const BILETPRO_AUDIT_QUEUE_KEY = 'BiletPro_AuditQueue';
const BILETPRO_AUDIT_FLUSH_BATCH = 20;
const BILETPRO_AUDIT_FLUSH_TIMEOUT_MS = 4500;
const BILETPRO_AUDIT_FLUSH_BASE_DELAY_MS = 250;
const BILETPRO_AUDIT_FLUSH_MAX_DELAY_MS = 12000;

function getAuditQueue() {
    try {
        const raw = localStorage.getItem(BILETPRO_AUDIT_QUEUE_KEY) || '[]';
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function setAuditQueue(list) {
    try {
        localStorage.setItem(BILETPRO_AUDIT_QUEUE_KEY, JSON.stringify(Array.isArray(list) ? list : []));
    } catch (_) {}
}

function withTimeout(promise, ms) {
    return new Promise((resolve) => {
        let done = false;
        const timer = setTimeout(() => {
            if (done) return;
            done = true;
            resolve({ timeout: true, value: false });
        }, ms);

        Promise.resolve(promise)
            .then((v) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                resolve({ timeout: false, value: v });
            })
            .catch(() => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                resolve({ timeout: false, value: false });
            });
    });
}

window.scheduleAuditFlush = function(delayMs = BILETPRO_AUDIT_FLUSH_BASE_DELAY_MS) {
    const safeDelay = Math.max(0, Number(delayMs) || 0);
    if (window.__bpAuditFlushTimer) clearTimeout(window.__bpAuditFlushTimer);

    const runner = () => {
        if (typeof window.flushAuditQueue === 'function') {
            window.flushAuditQueue().catch(() => {});
        }
    };

    window.__bpAuditFlushTimer = setTimeout(() => {
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(runner, { timeout: 1200 });
        } else {
            setTimeout(runner, 0);
        }
    }, safeDelay);
}

window.flushAuditQueue = async function() {
    if (window.__bpAuditFlushRunning) return { ok: false, reason: 'busy' };
    if (!window.BiletProOnlineStore || typeof window.BiletProOnlineStore.writeAudit !== 'function') return { ok: false, reason: 'store_missing' };
    if (!navigator.onLine) return { ok: false, reason: 'offline' };

    try {
        const initRes = (typeof window.BiletProOnlineStore.init === 'function')
            ? await window.BiletProOnlineStore.init()
            : { mode: window.BiletProOnlineStore.getMode && window.BiletProOnlineStore.getMode() };
        if (!initRes || initRes.mode !== 'online') return { ok: false, reason: 'offline' };
    } catch (_) {
        return { ok: false, reason: 'init_failed' };
    }

    window.__bpAuditFlushRunning = true;
    try {
        let queue = getAuditQueue();
        if (!queue.length) return { ok: true, flushed: 0, left: 0 };

        let flushed = 0;
        const batchLimit = Math.min(BILETPRO_AUDIT_FLUSH_BATCH, queue.length);
        for (let i = 0; i < batchLimit; i++) {
            const item = queue[i];
            if (!item || !item.module || !item.action) continue;

            const result = await withTimeout(window.BiletProOnlineStore.writeAudit(
                item.module,
                item.action,
                item.details || '',
                item.actor || { name: 'anon', username: 'anon', role: 'guest' }
            ), BILETPRO_AUDIT_FLUSH_TIMEOUT_MS);
            const ok = !!(result && result.value === true);

            if (!ok) break;
            flushed++;
        }

        if (flushed > 0) {
            queue = queue.slice(flushed);
            setAuditQueue(queue);
        }

        if (!queue.length) {
            window.__bpAuditFlushFailCount = 0;
        } else if (flushed > 0) {
            window.__bpAuditFlushFailCount = 0;
            if (typeof window.scheduleAuditFlush === 'function') {
                window.scheduleAuditFlush(BILETPRO_AUDIT_FLUSH_BASE_DELAY_MS);
            }
        } else {
            const failCount = (window.__bpAuditFlushFailCount || 0) + 1;
            window.__bpAuditFlushFailCount = failCount;
            const nextDelay = Math.min(BILETPRO_AUDIT_FLUSH_BASE_DELAY_MS * Math.pow(2, failCount), BILETPRO_AUDIT_FLUSH_MAX_DELAY_MS);
            if (typeof window.scheduleAuditFlush === 'function') {
                window.scheduleAuditFlush(nextDelay);
            }
        }

        return { ok: true, flushed, left: queue.length };
    } catch (_) {
        const failCount = (window.__bpAuditFlushFailCount || 0) + 1;
        window.__bpAuditFlushFailCount = failCount;
        const nextDelay = Math.min(BILETPRO_AUDIT_FLUSH_BASE_DELAY_MS * Math.pow(2, failCount), BILETPRO_AUDIT_FLUSH_MAX_DELAY_MS);
        if (typeof window.scheduleAuditFlush === 'function') {
            window.scheduleAuditFlush(nextDelay);
        }
        return { ok: false, reason: 'flush_exception' };
    } finally {
        window.__bpAuditFlushRunning = false;
    }
}

window.writeAuditEvent = function(module, action, details) {
    const logs = JSON.parse(localStorage.getItem('BiletPro_AuditLogs') || '[]');
    const session = JSON.parse(localStorage.getItem('BiletPro_Session')) || { name: 'anon', role: 'guest', username: 'guest' };
    logs.unshift({
        time: new Date().toLocaleString('tr-TR'),
        actor: session.name,
        username: session.username,
        role: session.role,
        module: module,
        action: action,
        details: details
    });
    if(logs.length > 1000) logs.splice(1000);
    localStorage.setItem('BiletPro_AuditLogs', JSON.stringify(logs));

    const queue = getAuditQueue();
    queue.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        module,
        action,
        details: details || '',
        actor: {
            name: session.name || 'anon',
            username: session.username || 'anon',
            role: session.role || 'guest'
        }
    });
    if (queue.length > 3000) queue.splice(0, queue.length - 3000);
    setAuditQueue(queue);

    // Kullanıcı akışını bloklamadan arka planda flush planla
    if(typeof window.scheduleAuditFlush === 'function') {
        window.scheduleAuditFlush(BILETPRO_AUDIT_FLUSH_BASE_DELAY_MS);
    }
}

window.addEventListener('online', () => {
    window.__bpAuditFlushFailCount = 0;
    if(typeof window.scheduleAuditFlush === 'function') window.scheduleAuditFlush(50);
});

document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible' && typeof window.scheduleAuditFlush === 'function') {
        window.scheduleAuditFlush(80);
    }
});

window.addEventListener('biletpro:audit-updated', () => {
    try {
        if (typeof window.renderAuditLogs === 'function') window.renderAuditLogs();
    } catch (_) {}
    try {
        if (typeof window.renderStaffPerformance === 'function') window.renderStaffPerformance();
    } catch (_) {}
});

window.BiletProActionAudit = {
    parseEvents(raw) {
        try {
            const parsed = JSON.parse(raw || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    },

    mapById(list) {
        const out = {};
        (Array.isArray(list) ? list : []).forEach((item) => {
            if (!item || item.id === undefined || item.id === null) return;
            out[String(item.id)] = item;
        });
        return out;
    },

    eventLabel(ev) {
        const title = String(ev?.title || 'Etkinlik').trim() || 'Etkinlik';
        const id = String(ev?.id || '-');
        return `${title} (#${id})`;
    },

    push(entries, seen, module, action, details) {
        const sig = `${module}|${action}|${details}`;
        if (seen.has(sig)) return;
        seen.add(sig);
        if (entries.length < 250) entries.push({ module, action, details });
    },

    diffEventPayloads(prevRaw, nextRaw) {
        const entries = [];
        const seen = new Set();

        const prevEvents = this.parseEvents(prevRaw);
        const nextEvents = this.parseEvents(nextRaw);

        const prevMap = this.mapById(prevEvents);
        const nextMap = this.mapById(nextEvents);

        // Event create/delete
        Object.keys(nextMap).forEach((id) => {
            if (!prevMap[id]) {
                const ev = nextMap[id];
                this.push(entries, seen, 'Dashboard', 'Etkinlik Oluşturuldu', `${this.eventLabel(ev)} oluşturuldu.`);
            }
        });
        Object.keys(prevMap).forEach((id) => {
            if (!nextMap[id]) {
                const ev = prevMap[id];
                this.push(entries, seen, 'Dashboard', 'Etkinlik Silindi', `${this.eventLabel(ev)} silindi.`);
            }
        });

        // Event-level deep changes
        Object.keys(nextMap).forEach((id) => {
            const prevEv = prevMap[id];
            const nextEv = nextMap[id];
            if (!prevEv || !nextEv) return;

            const label = this.eventLabel(nextEv);

            if (
                String(prevEv.title || '') !== String(nextEv.title || '') ||
                String(prevEv.date || '') !== String(nextEv.date || '') ||
                String(prevEv.venue || '') !== String(nextEv.venue || '') ||
                String(prevEv.city || '') !== String(nextEv.city || '') ||
                String(prevEv.fullAddress || '') !== String(nextEv.fullAddress || '') ||
                String(prevEv.startTime || '') !== String(nextEv.startTime || '') ||
                String(prevEv.doorTime || '') !== String(nextEv.doorTime || '') ||
                String(prevEv.isActive !== false) !== String(nextEv.isActive !== false)
            ) {
                this.push(entries, seen, 'Dashboard', 'Etkinlik Güncellendi', `${label} bilgileri güncellendi.`);
            }

            const prevCats = this.mapById(prevEv.categories || []);
            const nextCats = this.mapById(nextEv.categories || []);

            Object.keys(nextCats).forEach((catId) => {
                if (!prevCats[catId]) {
                    const c = nextCats[catId];
                    this.push(entries, seen, 'Gişe', 'Kategori Eklendi', `${label} için "${c?.name || 'Kategori'}" kategorisi eklendi.`);
                }
            });
            Object.keys(prevCats).forEach((catId) => {
                if (!nextCats[catId]) {
                    const c = prevCats[catId];
                    this.push(entries, seen, 'Gişe', 'Kategori Silindi', `${label} için "${c?.name || 'Kategori'}" kategorisi silindi.`);
                }
            });

            Object.keys(nextCats).forEach((catId) => {
                const prevCat = prevCats[catId];
                const nextCat = nextCats[catId];
                if (!prevCat || !nextCat) return;

                const catName = String(nextCat.name || prevCat.name || 'Kategori');

                if (
                    String(prevCat.name || '') !== String(nextCat.name || '') ||
                    Number(prevCat.pricePerPerson || 0) !== Number(nextCat.pricePerPerson || 0) ||
                    String(prevCat.color || '') !== String(nextCat.color || '')
                ) {
                    this.push(entries, seen, 'Gişe', 'Kategori Güncellendi', `${label} / ${catName} bilgileri değiştirildi.`);
                }

                const prevMas = this.mapById(prevCat.masalar || []);
                const nextMas = this.mapById(nextCat.masalar || []);

                Object.keys(nextMas).forEach((mId) => {
                    if (!prevMas[mId]) {
                        const m = nextMas[mId];
                        this.push(entries, seen, 'Gişe', 'Masa Eklendi', `${label} / ${catName} -> Masa ${m?.no || '-'} eklendi (${m?.kapasite || 0} kişilik).`);
                    }
                });
                Object.keys(prevMas).forEach((mId) => {
                    if (!nextMas[mId]) {
                        const m = prevMas[mId];
                        this.push(entries, seen, 'Gişe', 'Masa Silindi', `${label} / ${catName} -> Masa ${m?.no || '-'} kaldırıldı.`);
                    }
                });

                Object.keys(nextMas).forEach((mId) => {
                    const pm = prevMas[mId];
                    const nm = nextMas[mId];
                    if (!pm || !nm) return;

                    const masaNo = nm?.no || pm?.no || '-';

                    if (!!pm.isDeleted !== !!nm.isDeleted) {
                        this.push(entries, seen, 'Gişe', nm.isDeleted ? 'Masa Pasife Alındı' : 'Masa Aktifleştirildi', `${label} / ${catName} -> Masa ${masaNo} ${nm.isDeleted ? 'pasife alındı' : 'aktif edildi'}.`);
                    }

                    if (
                        Number(pm.no || 0) !== Number(nm.no || 0) ||
                        Number(pm.kapasite || 0) !== Number(nm.kapasite || 0)
                    ) {
                        this.push(entries, seen, 'Gişe', 'Masa Güncellendi', `${label} / ${catName} -> Masa ${pm.no || '-'} bilgileri ${nm.no || '-'} olarak güncellendi.`);
                    }

                    const wasSold = !!pm.isSold;
                    const isSold = !!nm.isSold;

                    if (!wasSold && isSold) {
                        const sd = nm.saleDetail || {};
                        this.push(entries, seen, 'Satış', 'Yeni Satış', `${label} / ${catName} -> Masa ${masaNo} satıldı (${nm.soldTo || 'Müşteri'}). Tahsilat: ₺${Number(sd.paid || 0).toLocaleString('tr-TR')} | Borç: ₺${Number(sd.debt || 0).toLocaleString('tr-TR')}`);
                        return;
                    }

                    if (wasSold && !isSold) {
                        this.push(entries, seen, 'Satış', 'Satış İptal/Silme', `${label} / ${catName} -> Masa ${masaNo} satışı iptal edildi.`);
                        return;
                    }

                    if (wasSold && isSold) {
                        const ps = pm.saleDetail || {};
                        const ns = nm.saleDetail || {};

                        if (
                            String(pm.soldTo || '') !== String(nm.soldTo || '') ||
                            String(ps.phone || '') !== String(ns.phone || '') ||
                            String(ps.paymentType || '') !== String(ns.paymentType || '') ||
                            Number(ps.people || 0) !== Number(ns.people || 0)
                        ) {
                            this.push(entries, seen, 'Satış', 'Satış Güncellendi', `${label} / ${catName} -> Masa ${masaNo} müşteri/satış bilgileri güncellendi.`);
                        }

                        const paidDiff = Number(ns.paid || 0) - Number(ps.paid || 0);
                        if (Math.abs(paidDiff) >= 0.01) {
                            this.push(entries, seen, 'Finans', paidDiff > 0 ? 'Tahsilat Arttı' : 'Tahsilat Azaltıldı', `${label} / ${catName} -> Masa ${masaNo} tahsilat ${paidDiff > 0 ? '+' : ''}₺${paidDiff.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} değişti.`);
                        }

                        const debtDiff = Number(ns.debt || 0) - Number(ps.debt || 0);
                        if (Math.abs(debtDiff) >= 0.01) {
                            this.push(entries, seen, 'Finans', debtDiff > 0 ? 'Borç Eklendi' : 'Borç Azaldı/Silindi', `${label} / ${catName} -> Masa ${masaNo} borç ${debtDiff > 0 ? '+' : ''}₺${debtDiff.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} değişti.`);
                        }

                        if (String(ps.status || '') !== String(ns.status || '')) {
                            this.push(entries, seen, 'KAPI', 'Kapı Durumu Değişti', `${label} / ${catName} -> Masa ${masaNo} durum: ${ps.status || 'READY'} -> ${ns.status || 'READY'}`);
                        }

                        if (Number(ps.insideCount || 0) !== Number(ns.insideCount || 0)) {
                            this.push(entries, seen, 'KAPI', 'Giriş Sayısı Güncellendi', `${label} / ${catName} -> Masa ${masaNo} içerideki kişi: ${Number(ps.insideCount || 0)} -> ${Number(ns.insideCount || 0)}`);
                        }
                    }
                });
            });
        });

        return entries;
    }
};

(function installAutomaticActionLogger() {
    if (window.__bpAutomaticActionLoggerInstalled) return;
    window.__bpAutomaticActionLoggerInstalled = true;

    const _setItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(key, value) {
        const prevRaw = (key === 'EventPro_DB_Ultimate_Final') ? (localStorage.getItem(key) || '[]') : null;
        _setItem(key, value);

        if (key !== 'EventPro_DB_Ultimate_Final') return;
        if ((prevRaw || '') === (value || '')) return;
        if (window.__bpSkipAutoAudit === true || window.__bpSkipAutoPush === true) return;
        if (window.__bpAutoAuditGuard === true) return;

        try {
            const entries = window.BiletProActionAudit.diffEventPayloads(prevRaw, value || '[]');
            if (!entries.length) return;

            window.__bpAutoAuditGuard = true;
            entries.forEach((entry) => {
                if (typeof window.writeAuditEvent === 'function') {
                    window.writeAuditEvent(entry.module, entry.action, entry.details);
                }
            });
        } catch (e) {
            console.warn('[BiletPro] Otomatik aksiyon logu üretilemedi:', e);
        } finally {
            window.__bpAutoAuditGuard = false;
        }
    };
})();

/* ==========================================
   DARK MODE & SAYFA GEÇİŞ YARDIMCILARI
   ========================================== */

// Dark mode CSS — JS ile inject edilir (Tailwind CDN cache sorununu aşar)
/* ==========================================
   TEMA (AÇIK / KOYU)
   Renkler theme.css içindeki değişkenlerle yönetilir.
   ========================================== */
window.setTheme = function(mode) {
    const html = document.documentElement;
    const next = mode === 'dark' ? 'dark' : 'light';
    html.classList.add('bp-theme-anim');
    html.setAttribute('data-theme', next);
    try { localStorage.setItem('BiletPro_Theme', next); localStorage.removeItem('BiletPro_DarkMode'); } catch (_) {}
    if (typeof window._syncThemeSwitch === 'function') window._syncThemeSwitch();
    setTimeout(() => html.classList.remove('bp-theme-anim'), 400);
};
window.toggleDarkMode = function() {
    window.setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
};
window._syncThemeSwitch = function() {
    const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    document.querySelectorAll('#bpThemeSwitch button').forEach(b => b.classList.toggle('on', b.dataset.mode === cur));
};

/* ==========================================
   SOL MENÜ ENJEKSİYONU (SQUEEZE YAPISI)
   ========================================== */
function injectMenu(active = 'dashboard', eventId = null) {
    const session = JSON.parse(localStorage.getItem('BiletPro_Session')) || { name: "Misafir", role: "user" };
    const _injectStaffRec = (JSON.parse(localStorage.getItem('BiletPro_Staff') || '[]') || []).find(s => (s.username||'').toLowerCase() === (session.username||'').toLowerCase());
    const isAdmin = session.role === 'admin' || !!(_injectStaffRec && _injectStaffRec.role === 'admin');
    const roleLabel = isAdmin ? 'YÖNETİCİ' : 'PERSONEL';
    const roleClass = isAdmin ? 'admin' : 'user';
    const cfg = window.BiletProCore.getConfig();
    const labels = cfg.menuLabels || {};
    const visibility = cfg.menuVisibility || {};

    const style = document.createElement('style');
    style.innerHTML = `
        :root { --sb-c: 76px; --sb-e: 264px; }
        html, body { height: 100%; margin: 0; padding: 0 !important; overflow: hidden; background: var(--bg); }

        /* flex-row body: sidebar solda, içerik sağda */
        body { display: flex !important; flex-direction: row !important; }
        body > *:not(.sidebar-silk) { flex: 1; min-width: 0; overflow: hidden; }

        .sidebar-silk {
            width: var(--sb-c); height: 100vh; height: 100dvh; flex-shrink: 0;
            background: var(--surface); border-right: 1px solid var(--border);
            display: flex; flex-direction: column; align-items: stretch;
            padding: 14px 12px; gap: 6px; z-index: 100000; position: relative;
            overflow: hidden; transition: width .28s cubic-bezier(.2,.8,.2,1);
        }
        .sidebar-silk.expanded { width: var(--sb-e); overflow-y: auto; overflow-x: hidden; }

        /* Üst: marka + menü düğmesi */
        .sb-head { display: flex; align-items: center; gap: 10px; height: 44px; margin-bottom: 8px; padding: 0 2px; flex-shrink: 0; }
        .sb-logo {
            width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0; cursor: pointer;
            background: linear-gradient(135deg, var(--primary), #8b5cf6); color: #fff;
            display: flex; align-items: center; justify-content: center; box-shadow: var(--shadow-md);
        }
        .sb-logo svg { width: 20px; height: 20px; }
        .sb-brand { display: none; flex-direction: column; line-height: 1.1; min-width: 0; flex: 1; }
        .sb-brand b { font-size: 15px; font-weight: 700; color: var(--text); letter-spacing: -.01em; }
        .sb-brand span { font-size: 11px; color: var(--faint); font-weight: 500; }
        .sb-toggle {
            display: none; width: 32px; height: 32px; border-radius: 10px; border: 1px solid var(--border);
            background: var(--surface); color: var(--muted); cursor: pointer; align-items: center; justify-content: center;
        }
        .sb-toggle:hover { background: var(--surface-3); color: var(--text); }
        .sb-toggle svg { width: 16px; height: 16px; }
        .sidebar-silk.expanded .sb-brand { display: flex; }
        .sidebar-silk.expanded .sb-toggle { display: inline-flex; }

        .nav-section { display: none; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--faint); padding: 10px 12px 4px; }
        .sidebar-silk.expanded .nav-section { display: block; }

        .nav-list { width: 100%; flex: 1; display: flex; flex-direction: column; gap: 2px; padding-top: 2px; min-height: 0; overflow-y: auto; overflow-x: hidden; }
        .nav-link {
            display: flex; align-items: center; gap: 12px; height: 42px; padding: 0 12px;
            border-radius: 11px; color: var(--muted); text-decoration: none; position: relative;
            white-space: nowrap; min-width: 0; transition: background .15s, color .15s;
        }
        .nav-link i { width: 20px; height: 20px; flex-shrink: 0; display: inline-flex; font-style: normal; }
        .nav-link i svg { width: 20px; height: 20px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
        .nav-txt { font-size: 14px; font-weight: 550; margin: 0; letter-spacing: 0; color: inherit; opacity: 0; visibility: hidden; overflow: hidden; text-overflow: ellipsis; transition: opacity .2s; }
        .sidebar-silk.expanded .nav-txt { opacity: 1; visibility: visible; }
        .sidebar-silk:not(.expanded) .nav-link { justify-content: center; padding: 0; }
        .sidebar-silk:not(.expanded) .nav-txt { display: none; }
        .nav-link:hover { background: var(--surface-3); color: var(--text); }
        .nav-link.active { background: var(--primary-soft); color: var(--primary-text); }
        .nav-link.active .nav-txt { font-weight: 650; }
        .sidebar-silk:not(.expanded) .nav-link[data-tip]:hover::after {
            content: attr(data-tip); position: fixed; left: calc(var(--sb-c) + 8px); background: var(--text); color: var(--bg);
            font-size: 12px; font-weight: 600; padding: 6px 10px; border-radius: 8px; pointer-events: none; white-space: nowrap; z-index: 200001;
        }

        main, .main-content {
            flex: 1; min-height: 0; height: auto; overflow-y: auto; -webkit-overflow-scrolling: touch;
            overscroll-behavior: contain; background: var(--bg); position: relative;
        }

        /* Modal kartları: ekrana sığmayan içerik kaydırılabilir */
        .modal-scroll { max-height: calc(100vh - 24px); max-height: calc(100dvh - 24px); overflow-y: auto !important; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
        .u-sec { display: none !important; }
        .quick-actions { display: none !important; }

        /* Alt bölüm: kullanıcı + araçlar */
        .sb-bottom { width: 100%; flex-shrink: 0; border-top: 1px solid var(--border); padding-top: 10px; display: flex; flex-direction: column; gap: 8px; }
        .sb-user-badge { display: flex; align-items: center; gap: 10px; padding: 6px; border-radius: 12px; min-width: 0; margin: 0; border: 0; }
        .sidebar-silk:not(.expanded) .sb-user-badge { justify-content: center; padding: 6px 0; }
        .sb-user-info { display: none; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
        .sidebar-silk.expanded .sb-user-info { display: flex; }
        .bp-top-avatar {
            width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0; background: var(--primary-soft); color: var(--primary-text);
            display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; border: 1px solid var(--primary-border);
        }
        .bp-top-user { font-size: 13.5px; font-weight: 650; color: var(--text); text-transform: none; letter-spacing: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; }
        .bp-top-role { width: fit-content; font-size: 11px; font-weight: 600; letter-spacing: 0; padding: 1px 8px; border-radius: 999px; line-height: 1.5; }
        .bp-top-role.admin { background: var(--primary-soft); color: var(--primary-text); border: 0; }
        .bp-top-role.user { background: var(--surface-3); color: var(--text-2); border: 0; }
        .bp-top-time { display: none; }
        .sb-clock { display: none; font-size: 12px; font-weight: 600; color: var(--muted); font-variant-numeric: tabular-nums; padding: 0 8px; }
        .sidebar-silk.expanded .sb-clock { display: block; }

        .sb-tools { display: flex; flex-direction: column; gap: 4px; }
                .sb-t {
            display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 10px; border-radius: 10px;
            background: transparent; border: 0; color: var(--muted); font-size: 13px; font-weight: 550; cursor: pointer;
            text-transform: none; letter-spacing: 0; white-space: nowrap; transition: background .15s, color .15s; width: 100%; text-align: left;
        }
        .sb-t svg { width: 18px; height: 18px; flex-shrink: 0; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
        .sidebar-silk:not(.expanded) .sb-t { justify-content: center; padding: 0; }
        .sidebar-silk:not(.expanded) .sb-t span { display: none; }
        .sb-t:hover { background: var(--surface-3); color: var(--text); }
        .sb-t.exit:hover { background: var(--danger-soft); color: var(--danger-text); }
        .sb-t.warn-btn:hover { background: var(--warning-soft); color: var(--warning-text); }
        .sb-more { display: none; flex-direction: column; gap: 4px; }
        .sidebar-silk.expanded .sb-more { display: flex; }

        /* Açık / koyu tema anahtarı */
        .theme-switch { display: flex; padding: 3px; gap: 2px; background: var(--surface-3); border-radius: 11px; }
        .theme-switch button {
            flex: 1; height: 30px; border: 0; border-radius: 8px; background: transparent; color: var(--muted);
            display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-size: 12.5px; font-weight: 600; cursor: pointer;
        }
        .theme-switch button svg { width: 15px; height: 15px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
        .theme-switch button.on { background: var(--surface); color: var(--text); box-shadow: var(--shadow-sm); }
        .sidebar-silk:not(.expanded) .theme-switch { background: transparent; padding: 0; }
        .sidebar-silk:not(.expanded) .theme-switch button span { display: none; }
        .sidebar-silk:not(.expanded) .theme-switch button.on { display: none; }
        .sidebar-silk:not(.expanded) .theme-switch button { height: 36px; }
        .sidebar-silk:not(.expanded) .theme-switch button:hover { background: var(--surface-3); color: var(--text); }

        @media (max-width: 1023px) {
            :root { --sb-c: 64px; }
            .sidebar-silk { padding: 10px 8px; }
            .sidebar-silk.expanded {
                position: fixed; left: 0; top: 0; bottom: 0; width: min(86vw, 300px);
                box-shadow: 20px 0 50px rgba(0,0,0,.18);
            }
        }
`;
    document.head.appendChild(style);

    const eventParams = eventId ? `?id=${eventId}` : '';
    
    // Kullanıcının gerçek yetkilerini yükle (sidebar'da sadece girebileceği sayfalar gösterilsin)
    const _sbStaff = JSON.parse(localStorage.getItem('BiletPro_Staff') || '[]');
    const _sbUser  = _sbStaff.find(s => (s.username || '').toLowerCase() === (session.username || '').toLowerCase()) || {};
    const _sbPerms = isAdmin
        ? { pSale: true, pDoor: true, pManageEvents: true, pManageStaff: true, pReports: true, pViewLogs: true }
        : (_sbUser.perms || {});
    const _canGise = isAdmin || (_sbPerms.pManageEvents === true && (_sbPerms.pManageStaff === true || _sbPerms.pReports === true));
    const _canSale = isAdmin || _sbPerms.pSale === true;
    const _canDoor = isAdmin || _sbPerms.pDoor === true;


    const _svg = (p) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + p + '</svg>';
    const _I = {
        dashboard: _svg('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
        gise: _svg('<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 11v2M13 17v2"/>'),
        satis: _svg('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>'),
        musteriler: _svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
        masalar: _svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="m14 17.5 2 2 4-4"/>'),
        duzen: _svg('<rect x="3" y="3" width="18" height="5" rx="1.5"/><circle cx="6.5" cy="14" r="2.5"/><circle cx="12" cy="14" r="2.5"/><circle cx="17.5" cy="14" r="2.5"/><circle cx="9" cy="20" r="1.5"/><circle cx="15" cy="20" r="1.5"/>'),
        checkin: _svg('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>'),
        personel: _svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>'),
        report: _svg('<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>'),
        settings: _svg('<path d="M20 7h-9M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>'),
        sun: _svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'),
        moon: _svg('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'),
        logout: _svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
        book: _svg('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>'),
        download: _svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'),
        upload: _svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>'),
        flask: _svg('<path d="M10 2v7.31L4.5 20a1 1 0 0 0 .9 1.5h13.2a1 1 0 0 0 .9-1.5L14 9.31V2M8.5 2h7"/>'),
        chevrons: _svg('<path d="m11 17-5-5 5-5M18 17l-5-5 5-5"/>'),
        mark: _svg('<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M13 5v14" stroke="currentColor" stroke-width="2" stroke-dasharray="2 3"/>')
    };
    // Etiketler ayarlardan BÜYÜK HARFLE gelebilir; menüde okunaklı yazıya çevir.
    const _nice = (t) => String(t || '').toLocaleLowerCase('tr-TR').replace(/(^|[\s&/-])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('tr-TR'));

    const menuItems = [
        { id: 'dashboard',   label: labels.dashboard   || 'Dashboard',        icon: _I.dashboard,  url: 'index.html',                show: visibility.dashboard  !== false },
        { id: 'gise',        label: labels.gise        || 'Gişe & Mimari',     icon: _I.gise,       url: `gise.html${eventParams}`,    show: visibility.gise       !== false && _canGise },
        { id: 'satis',       label: labels.satis       || 'Bilet Satış',       icon: _I.satis,      url: `satis.html${eventParams}`,   show: visibility.satis      !== false && _canSale },
        { id: 'musteriler',  label: labels.musteriler  || 'Müşteriler',        icon: _I.musteriler, url: `musteriler.html${eventParams}`, show: visibility.musteriler !== false && _canSale },
        { id: 'checkin',     label: labels.checkin     || 'Kapı Kontrol',      icon: _I.checkin,    url: `checkin.html${eventParams}`, show: visibility.checkin    !== false && _canDoor },
        { id: 'duzen',       label: labels.duzen       || 'Oturma Düzeni',   icon: _I.duzen,      url: `duzen.html${eventParams}`,   show: isAdmin && visibility.duzen !== false },
        { id: 'masalar',     label: labels.masalar     || 'Masa Durumu',     icon: _I.masalar,    url: `masalar.html${eventParams}`, show: visibility.masalar !== false && _canDoor },
        { id: 'personel',    label: labels.personel    || 'Personel',          icon: _I.personel,   url: 'personel.html',              show: isAdmin && visibility.personel !== false },
        { id: 'report',      label: labels.report      || 'Raporlar',          icon: _I.report,     url: 'rapor.html',                 show: isAdmin && visibility.report   !== false },
        { id: 'settings',    label: labels.settings    || 'Sistem Ayarları',   icon: _I.settings,   url: 'settings.html',              show: isAdmin && visibility.settings !== false }
    ];

    const _brandName = (cfg.brand && cfg.brand.appName) || 'BiletPro';
    let html = `
        <nav class="sidebar-silk" id="proSidebar">
            <div class="sb-head">
                <div class="sb-logo" onclick="toggleProSidebar()" title="Menü">${_I.mark}</div>
                <div class="sb-brand"><b>${_brandName}</b><span>Etkinlik Yönetimi</span></div>
                <button class="sb-toggle" onclick="toggleProSidebar()" title="Menüyü daralt">${_I.chevrons}</button>
            </div>
            <div class="nav-list">
                ${menuItems.filter(i => i.show).map(i => `
                    <a href="${i.id === 'settings' ? '#' : i.url}" ${i.id === 'settings' ? 'onclick="event.preventDefault(); openSystemSettings();"' : ''} class="nav-link ${active === i.id ? 'active' : ''}" data-tip="${_nice(i.label)}">
                        <i>${i.icon}</i><span class="nav-txt">${_nice(i.label)}</span>
                    </a>
                `).join('')}
            </div>
            <div class="sb-bottom">
                <div class="sb-more">
                    <button onclick="openGuide()" class="sb-t">${_I.book}<span>Kılavuz</span></button>
                    <button onclick="backupAllData()" class="sb-t">${_I.download}<span>Yedek Al</span></button>
                    <button onclick="triggerRestoreDialog()" class="sb-t">${_I.upload}<span>Yedekten Geri Yükle</span></button>
                    <button onclick="resetDemoData()" class="sb-t warn-btn">${_I.flask}<span>Demo Verisi</span></button>
                </div>
                <div class="theme-switch" id="bpThemeSwitch">
                    <button data-mode="light" onclick="setTheme('light')" title="Açık tema">${_I.sun}<span>Açık</span></button>
                    <button data-mode="dark" onclick="setTheme('dark')" title="Koyu tema">${_I.moon}<span>Koyu</span></button>
                </div>
                <div class="sb-user-badge">
                    <div class="bp-top-avatar" id="bpTopAvatar">${String((session.name || 'M').trim().charAt(0) || 'M').toLocaleUpperCase('tr-TR')}</div>
                    <div class="sb-user-info">
                        <span class="bp-top-user" id="bpTopUser">${session.name || 'Misafir'}</span>
                        <span class="bp-top-role ${roleClass}" id="bpTopRole">${roleLabel === 'YÖNETİCİ' ? 'Yönetici' : 'Personel'}</span>
                    </div>
                    <span class="bp-top-time" id="bpTopClock"></span>
                </div>
                <button onclick="logout(event)" class="sb-t exit">${_I.logout}<span>Çıkış Yap</span></button>
            </div>
        </nav>
    
`;
    document.body.insertAdjacentHTML('afterbegin', html);

    if (typeof window._syncThemeSwitch === 'function') window._syncThemeSwitch();

    // Sayfa geçiş animasyonu: nav-link tıklamalarında fade-out
    setTimeout(() => {
        document.querySelectorAll('.nav-link').forEach(link => {
            const href = link.getAttribute('href');
            if (!href || href === '#') return;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                document.body.classList.add('bp-fading');
                setTimeout(() => { window.location.href = href; }, 160);
            });
        });
    }, 0);

    const clockEl = document.getElementById('bpTopClock');
    if (clockEl) {
        const tick = () => {
            clockEl.textContent = new Date().toLocaleTimeString('tr-TR', { hour12: false });
        };
        tick();
        if (window.__bpTopClockTimer) clearInterval(window.__bpTopClockTimer);
        window.__bpTopClockTimer = setInterval(tick, 1000);
    }

    if(!document.getElementById('restoreInput')) {
        const restoreInput = document.createElement('input');
        restoreInput.type = 'file';
        restoreInput.id = 'restoreInput';
        restoreInput.accept = '.json';
        restoreInput.className = 'hidden';
        restoreInput.onchange = (e) => restoreAllData(e.target.files && e.target.files[0]);
        document.body.appendChild(restoreInput);
    }

    if(!document.getElementById('guideModal')) {
        const guideHtml = `
            <div id="guideModal" class="fixed inset-0 hidden z-[99999] bg-slate-900/70 flex items-center justify-center p-4">
                <div class="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
                    <!-- Header -->
                    <div class="flex justify-between items-center px-7 py-5 border-b border-slate-100 flex-shrink-0">
                        <div>
                            <h2 class="text-base font-black uppercase tracking-tight text-slate-900">📘 BiletPro Kullanım Kılavuzu</h2>
                            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Tüm modüller ve yetkiler</p>
                        </div>
                        <button onclick="closeGuide()" class="w-9 h-9 rounded-full bg-slate-100 hover:bg-red-100 hover:text-red-600 flex items-center justify-center text-lg font-black transition-colors">&times;</button>
                    </div>
                    <!-- Scrollable body -->
                    <div class="overflow-y-auto px-7 py-5 space-y-5 text-xs text-slate-700">

                        <!-- Dashboard -->
                        <div class="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                            <p class="font-black text-sm uppercase tracking-tight text-slate-900 mb-2">🏠 Dashboard (Ana Ekran)</p>
                            <ul class="space-y-1 leading-5 pl-3 list-disc">
                                <li>Etkinlik <strong>ekle, düzenle, sil</strong> ve <strong>pasif/aktif</strong> geçişi yapın.</li>
                                <li>Her etkinliğe <strong>masa kategorisi</strong> (VIP, Standart, vb.) ekleyin; kapasite ve fiyat belirleyin.</li>
                                <li>Silinen etkinliğin ciro ve borç verileri <strong>Finans Arşivi</strong>'ne otomatik aktarılır.</li>
                                <li>Sağ üstteki <strong>Gişe</strong> butonu o etkinliğin koltuk haritasına açılır.</li>
                            </ul>
                        </div>

                        <!-- Gişe -->
                        <div class="bg-blue-50 rounded-2xl p-4 border border-blue-100">
                            <p class="font-black text-sm uppercase tracking-tight text-slate-900 mb-2">🎟️ Gişe</p>
                            <ul class="space-y-1 leading-5 pl-3 list-disc">
                                <li>Masa renkleri: <span class="font-bold text-slate-600">Gri=Boş</span> · <span class="font-bold text-green-700">Yeşil=Satıldı</span> · <span class="font-bold text-blue-700">Mavi=İçeride</span> · <span class="font-bold text-yellow-700">Sarı=Geçici Çıkış</span>.</li>
                                <li>Boş masaya tıklayınca <strong>Hızlı Satış</strong> formu açılır; müşteri adı, telefon, kişi sayısı ve ödeme bilgisi girin.</li>
                                <li>Satılmış masaya tıklayınca <strong>iptal</strong> (pCancel yetkisi), <strong>bilet gönder</strong> ve detay seçenekleri çıkar.</li>
                                <li>Tüm gişe işlemleri <strong>Audit Log</strong>'a otomatik kaydedilir.</li>
                            </ul>
                        </div>

                        <!-- Satış -->
                        <div class="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
                            <p class="font-black text-sm uppercase tracking-tight text-slate-900 mb-2">💳 Satış</p>
                            <ul class="space-y-1 leading-5 pl-3 list-disc">
                                <li>Etkinlik → kategori → masa seçimi yapıldıktan sonra müşteri bilgileri ve ödeme yöntemi girilir.</li>
                                <li><strong>İndirim</strong> uygulayabilmek için <em>pDiscount</em> yetkisi gerekir; yetkisiz personelde alan gizlenir.</li>
                                <li>Admin olmayan personel <strong>kendi adına</strong> satış yapar; başkası adına satışçı alanı değiştirilemez (DOM koruma).</li>
                                <li>Kısmi ödeme yapılabilir; kalan tutar müşteri <strong>borç</strong> olarak CRM'e yansır.</li>
                            </ul>
                        </div>

                        <!-- Kapı -->
                        <div class="bg-purple-50 rounded-2xl p-4 border border-purple-100">
                            <p class="font-black text-sm uppercase tracking-tight text-slate-900 mb-2">🚪 Kapı (Check-in)</p>
                            <ul class="space-y-1 leading-5 pl-3 list-disc">
                                <li>Bilet kodunu arama kutusuna yazın veya QR okutun; sistem kaç kişinin gireceğini sorar.</li>
                                <li><strong>Borçlu müşteri</strong> geçişi için <em>pDoorRisk</em> yetkisi gerekir; yetkisiz personel borçlu girişi onaylayamaz.</li>
                                <li>Kapıda tahsilat yapabilmek için <em>pDoorPay</em> yetkisi gereklidir.</li>
                                <li><strong>Geçici Çıkış / Tekrar Giriş</strong> (WC, sigara) butonları giriş sayfasında mevcuttur.</li>
                                <li>Her giriş onayı; <strong>personel adı, saat ve kişi sayısıyla</strong> birlikte kaydedilir ve Müşteriler ekranında görünür.</li>
                            </ul>
                        </div>

                        <!-- Müşteriler -->
                        <div class="bg-amber-50 rounded-2xl p-4 border border-amber-100">
                            <p class="font-black text-sm uppercase tracking-tight text-slate-900 mb-2">👥 Müşteriler (CRM)</p>
                            <ul class="space-y-1 leading-5 pl-3 list-disc">
                                <li>Müşteriler <strong>telefon + isim</strong> kombinasyonuna göre ayrı kayıt olarak oluşturulur.</li>
                                <li>Her müşteri satırında son etkinliğin <strong>giriş durumu badge'i</strong> gösterilir: ✅ İçeride · 🚶 Geçici Çıkış · ✔️ Giriş Yapıldı · ⏳ Giriş Yok.</li>
                                <li>📋 (Geçmiş) butonunda tüm etkinlik geçmişi listelenir; her kart için <strong>giren kişi sayısı, onaylayan personel ve giriş saati</strong> görünür.</li>
                                <li>Kırmızı <strong>TAHSİLAT</strong> butonu borçlu müşteriler için görünür; pCancel veya admin yetkisi gerekir.</li>
                                <li>Müşteri silme ve <strong>Kara Liste</strong> işlemleri <em>pManageStaff</em> yetkisi ister.</li>
                                <li>✉️ <strong>Kampanya Auto-Pilot</strong>: Birden fazla müşteri seçip toplu WhatsApp mesajı kuyruğuna alın.</li>
                            </ul>
                        </div>

                        <!-- Personel -->
                        <div class="bg-rose-50 rounded-2xl p-4 border border-rose-100">
                            <p class="font-black text-sm uppercase tracking-tight text-slate-900 mb-2">🧑‍💼 Personel Yönetimi</p>
                            <ul class="space-y-1 leading-5 pl-3 list-disc">
                                <li>Personel ekle, düzenle, <strong>pasif/aktif</strong> geçişi yap; kendi hesabını silemez veya pasife alamazsın.</li>
                                <li><strong>Admin rolü</strong> yalnızca başka bir admin tarafından atanabilir (yetki yükseltme koruması).</li>
                                <li>Admin hesabını düzenlemek veya silmek için de admin olmak gerekir.</li>
                                <li><strong>Yetki Matrisi</strong> — atanabilecek izinler:<br>
                                    <span class="inline-block mt-1 font-mono text-[10px] bg-white border border-rose-200 rounded-lg px-2 py-1 leading-5">
                                        pSale Satış · pDiscount İndirim · pCancel İptal+Borç<br>
                                        pDoor Kapı · pDoorPay Kap.Tahsilat · pDoorRisk Borçlu Geçiş<br>
                                        pManageEvents Etkinlik · pReports Raporlar<br>
                                        pManageStaff Personel+Müşteri · pViewLogs Audit Log
                                    </span>
                                </li>
                                <li>Audit Log sekmesinde aktör ve işlem tipine göre <strong>filtreleme</strong> ve <strong>CSV indirme</strong> yapılabilir.</li>
                            </ul>
                        </div>

                        <!-- Raporlar -->
                        <div class="bg-cyan-50 rounded-2xl p-4 border border-cyan-100">
                            <p class="font-black text-sm uppercase tracking-tight text-slate-900 mb-2">📊 Raporlar</p>
                            <ul class="space-y-1 leading-5 pl-3 list-disc">
                                <li><strong>Personel Finansal Performans</strong>: Ciro, satış adedi, geciken borç, iptal oranı.</li>
                                <li><strong>Borçlu Liste</strong>: Gecikmiş borçlar; <em>Hatırlatma Gönder</em> ile WhatsApp linki oluşturur.</li>
                                <li><strong>Finans Arşivi</strong>: Silinmiş etkinliklerin ciro ve borçları; <em>Arşivi CSV İndir</em> butonu ile dışa aktarılır.</li>
                                <li><strong>Audit Log Filtreleme</strong>: İptal işlemleri veya borçlu geçişleri ayrı görüntülenebilir; <em>PIN ile Sıfırla</em> seçeneği mevcuttur.</li>
                                <li>☁️ <em>Veri Çek</em> butonu online modda Supabase'den en güncel veriyi çeker.</li>
                            </ul>
                        </div>

                        <!-- Ayarlar -->
                        <div class="bg-slate-100 rounded-2xl p-4 border border-slate-200">
                            <p class="font-black text-sm uppercase tracking-tight text-slate-900 mb-2">⚙️ Sistem Ayarları <span class="text-[9px] font-bold text-red-500 ml-1">ADMIN + PIN</span></p>
                            <ul class="space-y-1 leading-5 pl-3 list-disc">
                                <li><strong>Marka</strong>: Uygulama adı, kısa marka, giriş alt başlık, logo dosyası ve ana renk.</li>
                                <li><strong>Online Mod</strong>: Supabase URL ve Anon Key girerek çoklu cihaz senkronizasyonunu etkinleştirin.</li>
                                <li><strong>Yönetici PIN</strong>: Ayarlar sayfasına erişmek için ek PIN doğrulaması; boş bırakılırsa mevcut PIN korunur.</li>
                                <li><strong>Menü Görünürlüğü</strong>: Sidebar'daki linkleri göster/gizle (uygulama genelinde geçerlidir).</li>
                            </ul>
                        </div>

                        <!-- Güvenlik notu -->
                        <div class="bg-red-50 rounded-2xl p-4 border border-red-100">
                            <p class="font-black text-sm uppercase tracking-tight text-slate-900 mb-2">🔒 Güvenlik Notları</p>
                            <ul class="space-y-1 leading-5 pl-3 list-disc">
                                <li>Tüm yetki kontrolleri <strong>rol tabanlı</strong> çalışır; kullanıcı adına dayalı bypass yoktur.</li>
                                <li>Sidebar menü linkleri personelin sahip olduğu yetkiye göre <strong>otomatik filtrelenir</strong>.</li>
                                <li>Her kritik işlem (satış, iptal, giriş onayı, personel değişikliği) <strong>Audit Log</strong>'a kaydedilir.</li>
                                <li>Şifreler ve PIN kodları hiçbir zaman kod içine veya yorumlara yazılmamalıdır.</li>
                            </ul>
                        </div>

                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', guideHtml);
    }
}

window.openGuide = function() { const m = document.getElementById('guideModal'); if(m) m.classList.remove('hidden'); }
window.closeGuide = function() { const m = document.getElementById('guideModal'); if(m) m.classList.add('hidden'); }
const BILETPRO_SETTINGS_PIN_SESSION_KEY = 'BiletPro_SettingsPinUntil';

function hasValidSettingsPinSession() {
    const until = parseInt(sessionStorage.getItem(BILETPRO_SETTINGS_PIN_SESSION_KEY) || '0', 10) || 0;
    return until > Date.now();
}

function getSettingsPin() {
    const cfg = window.BiletProCore.getConfig();
    return String((cfg && cfg.security && cfg.security.settingsPin) || '').trim();
}

function requestSettingsPinModal() {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay show';
        overlay.innerHTML = `
            <div class="confirm-box" style="max-width:460px; text-align:left;">
                <div class="confirm-title" style="font-size:18px; margin-bottom:8px;">Ayarlar PIN doğrulama</div>
                <div class="confirm-desc" style="margin-bottom:14px;">Sistem ayarlarına girmek için yönetici PIN kodunu girin.</div>
                <input id="settingsPinInput" type="password" placeholder="PIN" style="width:100%;padding:12px 14px;" />
                <div id="settingsPinErr" style="display:none;margin-top:8px;font-size:12.5px;font-weight:600;color:var(--danger-text);">PIN yanlış.</div>
                <div class="confirm-actions" style="margin-top:16px;">
                    <button class="btn-c-cancel" id="settingsPinCancel">Vazgeç</button>
                    <button class="btn-c-confirm" id="settingsPinConfirm">Doğrula</button>
                </div>
            </div>
        `;

        const cleanup = (ok) => {
            overlay.remove();
            resolve(ok === true);
        };

        overlay.querySelector('#settingsPinCancel').onclick = () => cleanup(false);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });

        const input = overlay.querySelector('#settingsPinInput');
        const err = overlay.querySelector('#settingsPinErr');
        const checkPin = () => {
            const typed = String(input.value || '').trim();
            const configuredPin = getSettingsPin();
            if (!configuredPin) {
                err.textContent = 'Ayarlar PIN’i tanımlı değil. Yönetici tarafından yapılandırılmalı.';
                err.style.display = 'block';
                return;
            }
            if (typed && typed === configuredPin) {
                sessionStorage.setItem(BILETPRO_SETTINGS_PIN_SESSION_KEY, String(Date.now() + (15 * 60 * 1000)));
                cleanup(true);
                return;
            }
            err.style.display = 'block';
            input.focus();
            input.select();
        };

        overlay.querySelector('#settingsPinConfirm').onclick = checkPin;
        input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                checkPin();
            }
        });

        document.body.appendChild(overlay);
        input.focus();
    });
}

window.openSystemSettings = async function() {
    const session = JSON.parse(localStorage.getItem('BiletPro_Session') || '{}');
    const _sysStaffRec = (JSON.parse(localStorage.getItem('BiletPro_Staff') || '[]') || []).find(s => (s.username||'').toLowerCase() === (session.username||'').toLowerCase());
    const isAdmin = session.role === 'admin' || !!(_sysStaffRec && _sysStaffRec.role === 'admin');
    if (!isAdmin) {
        if (typeof showToast === 'function') showToast('Sistem ayarları sadece yöneticiye açıktır.', 'error');
        return;
    }

    if (!hasValidSettingsPinSession()) {
        const ok = await requestSettingsPinModal();
        if (!ok) return;
    }

    window.location.href = 'settings.html';
}

window.toggleProSidebar = function() { document.getElementById('proSidebar').classList.toggle('expanded'); }

window.getBackupKeys = function() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if(key && (key.startsWith('BiletPro_') || key.startsWith('EventPro_'))) {
            keys.push(key);
        }
    }
    return keys;
}

window.backupAllData = function() {
    const keys = getBackupKeys();
    if(!keys.length) {
        if(typeof showToast === 'function') showToast('Yedeklenecek veri bulunamadı.', 'error');
        return;
    }

    const payload = {
        meta: {
            app: 'BiletPro',
            exportedAt: new Date().toISOString(),
            version: '19.0'
        },
        data: {}
    };

    keys.forEach(k => {
        const raw = localStorage.getItem(k);
        try {
            payload.data[k] = JSON.parse(raw);
        } catch(_) {
            payload.data[k] = raw;
        }
    });

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[.:]/g, '-');
    link.href = URL.createObjectURL(blob);
    link.download = `BiletPro_Backup_${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();

    if(typeof writeAuditEvent === 'function') writeAuditEvent('Sistem', 'Yedek Alındı', `${keys.length} anahtar dışa aktarıldı.`);
    if(typeof showToast === 'function') showToast('Yedek dosyası indirildi.', 'success');
}

window.triggerRestoreDialog = function() {
    const input = document.getElementById('restoreInput');
    if(!input) return;
    input.value = '';
    input.click();
}

window.restoreAllData = function(file) {
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        let parsed;
        try {
            parsed = JSON.parse(reader.result);
        } catch(_) {
            if(typeof showToast === 'function') showToast('Yedek dosyası geçersiz.', 'error');
            return;
        }

        const backupData = parsed && parsed.data ? parsed.data : null;
        if(!backupData || typeof backupData !== 'object') {
            if(typeof showToast === 'function') showToast('Yedek içeriği okunamadı.', 'error');
            return;
        }

        showConfirm('VERİ GERİ YÜKLE', 'Mevcut veriler yedek ile değiştirilecek. Devam edilsin mi?', () => {
            const keys = Object.keys(backupData).filter(k => k.startsWith('BiletPro_') || k.startsWith('EventPro_'));
            if(!keys.length) {
                if(typeof showToast === 'function') showToast('Yedekte geri yüklenecek veri yok.', 'error');
                return;
            }

            getBackupKeys().forEach(k => localStorage.removeItem(k));

            keys.forEach(k => {
                const value = backupData[k];
                if(typeof value === 'string') localStorage.setItem(k, value);
                else localStorage.setItem(k, JSON.stringify(value));
            });

            if(typeof writeAuditEvent === 'function') writeAuditEvent('Sistem', 'Yedek Geri Yüklendi', `${keys.length} anahtar geri yüklendi.`);
            if(typeof showToast === 'function') showToast('Geri yükleme tamamlandı. Sayfa yenileniyor...', 'success');
            setTimeout(() => window.location.reload(), 700);
        });
    };
    reader.readAsText(file, 'utf-8');
}

window.resetDemoData = function() {
    showConfirm('DEMO SIFIRLAMA', 'Tüm etkinlik/satış/log verileri silinecek. Bu işlem geri alınamaz. Onaylıyor musunuz?', () => {
        const keys = getBackupKeys();
        keys.forEach(k => localStorage.removeItem(k));

        if(typeof writeAuditEvent === 'function') {
            // Temizlemeden sonra log anahtarı yoksa bu satır çalışmayabilir, sorun değil.
            writeAuditEvent('Sistem', 'Demo Sıfırlandı', 'Sistem verileri sıfırlandı.');
        }

        if(typeof showToast === 'function') showToast('Demo verileri temizlendi. Giriş sayfasına yönlendiriliyorsunuz...', 'info');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 800);
    });
}

window.logout = function(ev) {
    // Otomatik/programatik tetiklemeleri engelle, sadece gerçek kullanıcı etkileşimiyle çalışsın
    if (!ev || ev.isTrusted !== true) {
        console.warn('[BiletPro] logout otomatik çağrısı engellendi.');
        return;
    }

    showConfirm("ÇIKIŞ YAPILIYOR", "Güvenli çıkış yapılsın mı?", () => {
        localStorage.removeItem('BiletPro_Session');
        const done = () => { window.location.href = 'login.html'; };
        try {
            if (window.BiletProOnlineStore && typeof window.BiletProOnlineStore.signOut === 'function') {
                window.BiletProOnlineStore.signOut().then(done, done);
                setTimeout(done, 1500);
                return;
            }
        } catch (_) {}
        window.BiletProAuth && window.BiletProAuth.clear();
        done();
    });
}

/* ==========================================
   SMART RELOAD — Flash'sız, modal-güvenli yenileme
   ========================================== */
window.bpSmartReload = function(trigger) {
    const now = Date.now();
    // Son reload'dan 18s geçmemişse atla (hızlı döngü engeli)
    const lastAt = parseInt(sessionStorage.getItem('BiletPro_LastReloadAt') || '0', 10);
    if (now - lastAt < 18000) return;

    // Modal açık mı? (hidden olmayan fixed z-[...] elementler)
    const openModal = Array.from(document.querySelectorAll('.fixed')).some(el => {
        if (el.classList.contains('hidden')) return false;
        if (el.id === 'bpSyncPill') return false;
        const s = window.getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
    });
    // Input/textarea aktif mi?
    const inputBusy = document.activeElement &&
        ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName) &&
        document.activeElement.value !== '';

    const attempts = (window.__bpReloadAttempts || 0);
    if ((openModal || inputBusy) && attempts < 5) {
        window.__bpReloadAttempts = attempts + 1;
        // Kullanıcıya alt bildirim göster
        const pill = document.getElementById('bpSyncPill');
        if (pill) { pill.textContent = '⟳ VERİ DEĞİŞTİ — İŞLEM BİTİNCE YENİLENECEK'; pill.classList.add('show'); }
        setTimeout(() => window.bpSmartReload(trigger), 5000);
        return;
    }

    window.__bpReloadAttempts = 0;
    sessionStorage.setItem('BiletPro_LastReloadAt', String(now));
    // Pill'i temizle
    const pill = document.getElementById('bpSyncPill');
    if (pill) pill.classList.remove('show');
    // Fade-out → reload
    document.body.classList.add('bp-fading');
    setTimeout(() => window.location.reload(), 180);
};

/* ==========================================
   SOFT LOCK — Çakışan işlem görsel koruması
   (localStorage tabanlı, aynı cihazda çoklu sekme için)
   ========================================== */
window.bpSoftLock = {
    _key: 'BiletPro_SoftLocks',
    _ttl: 90000, // 90 saniye

    _read() {
        const now = Date.now();
        try {
            return (JSON.parse(localStorage.getItem(this._key) || '[]') || [])
                .filter(l => l && (now - (l.lockedAt || 0)) < this._ttl);
        } catch(_) { return []; }
    },
    _save(locks) {
        try { localStorage.setItem(this._key, JSON.stringify(locks)); } catch(_) {}
    },
    _id(eventId, masaNo) { return `EV${eventId}-M${masaNo}`; },

    // Kilit al. Başkası kilitlediyse false döner.
    acquire(eventId, masaNo, userName) {
        const id = this._id(eventId, masaNo);
        const locks = this._read();
        const existing = locks.find(l => l.id === id);
        if (existing && existing.lockedBy !== userName) return false;
        const filtered = locks.filter(l => l.id !== id);
        filtered.push({ id, eventId: String(eventId), masaNo: String(masaNo), lockedBy: userName, lockedAt: Date.now() });
        this._save(filtered);
        // Cross-device: Supabase Presence üzerinden yayınla
        if (window.BiletProPresence) {
            window.BiletProPresence.track(eventId, masaNo, userName);
        }
        return true;
    },

    // Kilit bırak
    release(eventId, masaNo) {
        this._save(this._read().filter(l => l.id !== this._id(eventId, masaNo)));
        // Cross-device: Presence kilidini de bırak
        if (window.BiletProPresence) {
            window.BiletProPresence.release(eventId, masaNo);
        }
    },

    // Başkasının kilidi varsa lock objesini döndür, yoksa null
    getConflict(eventId, masaNo, currentUser) {
        // 1) Aynı cihaz (localStorage)
        const lock = this._read().find(l => l.id === this._id(eventId, masaNo));
        if (lock && lock.lockedBy !== currentUser) return lock;
        // 2) Diğer cihazlar (Supabase Presence)
        if (window.BiletProPresence) {
            const remote = window.BiletProPresence.getConflict(eventId, masaNo, currentUser);
            if (remote) return { id: this._id(eventId, masaNo), ...remote };
        }
        return null;
    },

    // Tüm kilit listesini döndür (render için)
    getAll() { return this._read(); }
};

/* ==========================================
   PRESENCE — Supabase Realtime tabanlı çapraz cihaz masa kilidi
   ========================================== */
window.BiletProPresence = {
    _ch: null,
    _state: {},
    _user: null,
    _myLocks: [], // bu kullanıcının track'inde tutulan kilitler

    async init(client, userName) {
        if (!client || !userName) return;
        this._user = userName;
        // Eski kanalı temizle
        if (this._ch) {
            try { client.removeChannel(this._ch); } catch(_) {}
            this._ch = null;
        }
        const ch = client.channel('biletpro-presence', {
            config: { presence: { key: userName } }
        });
        ch.on('presence', { event: 'sync' }, () => {
            this._state = ch.presenceState() || {};
            try {
                window.dispatchEvent(new CustomEvent('biletpro:presence-updated', { detail: { state: this._state } }));
            } catch(_) {}
        });
        await ch.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                // Mevcut kilitleri tekrar yayınla (reconnect durumunda)
                if (this._myLocks.length > 0) {
                    await ch.track({ user: this._user, locks: this._myLocks });
                }
            }
        });
        this._ch = ch;
    },

    // Bu kullanıcı için bir masa kilidi ekle ve yayınla
    track(eventId, masaNo, userName) {
        if (!this._ch) return;
        const key = `${eventId}::${masaNo}`;
        const existing = this._myLocks.findIndex(l => l._key === key);
        const entry = { _key: key, eventId: String(eventId), masaNo: String(masaNo), at: Date.now() };
        if (existing === -1) this._myLocks.push(entry);
        else this._myLocks[existing] = entry;
        try { this._ch.track({ user: userName || this._user, locks: this._myLocks }); } catch(_) {}
    },

    // Bu kullanıcının belirli masa kilidini bırak
    release(eventId, masaNo) {
        if (!this._ch) return;
        const key = `${eventId}::${masaNo}`;
        this._myLocks = this._myLocks.filter(l => l._key !== key);
        try { this._ch.track({ user: this._user, locks: this._myLocks }); } catch(_) {}
    },

    // Diğer kullanıcıların kilitlerini döndür
    getRemoteLocks() {
        const result = [];
        const state = this._state || {};
        Object.keys(state).forEach(key => {
            const presences = Array.isArray(state[key]) ? state[key] : [];
            presences.forEach(p => {
                if (p.user && p.user !== this._user && Array.isArray(p.locks)) {
                    p.locks.forEach(l => {
                        result.push({ ...l, lockedBy: p.user, lockedAt: l.at || Date.now() });
                    });
                }
            });
        });
        return result;
    },

    // Belirli bir masa için başka kullanıcının kilidi var mı?
    getConflict(eventId, masaNo, currentUser) {
        return this.getRemoteLocks().find(
            l => String(l.eventId) === String(eventId) &&
                 String(l.masaNo) === String(masaNo) &&
                 l.lockedBy !== currentUser
        ) || null;
    }
};

/* ==========================================
   AUTO SYNC: LOCAL -> ONLINE (OFFLINE SAFE)
   ========================================== */
const BILETPRO_SYNC_STATUS_KEY = 'BiletPro_LastOnlineSyncStatus';
const BILETPRO_SYNC_RELOAD_FLAG = 'BiletPro_AutoReloadAfterHydrate';

window.BiletProAutoSync = {
    running: false,
    timer: null,

    getLocalEvents() {
        const events = safeJSON(localStorage.getItem('EventPro_DB_Ultimate_Final'), []);
        return Array.isArray(events) ? events : [];
    },

    async waitOnlineStore(maxWaitMs = 10000) {
        const started = Date.now();
        while (Date.now() - started < maxWaitMs) {
            if (window.BiletProOnlineStore && typeof window.BiletProOnlineStore.init === 'function') {
                return true;
            }
            await new Promise(r => setTimeout(r, 250));
        }
        return false;
    },

    saveStatus(payload) {
        try {
            localStorage.setItem(BILETPRO_SYNC_STATUS_KEY, JSON.stringify({
                at: new Date().toISOString(),
                ...payload
            }));
        } catch (_) {}
    },

    isSyncStale(maxAgeMs = 20000) {
        try {
            const raw = localStorage.getItem(BILETPRO_SYNC_STATUS_KEY);
            if (!raw) return true;
            const parsed = JSON.parse(raw);
            const at = parsed && parsed.at ? new Date(parsed.at).getTime() : 0;
            if (!at || Number.isNaN(at)) return true;
            return (Date.now() - at) > maxAgeMs;
        } catch (_) {
            return true;
        }
    },

    async syncNow(trigger = 'manual') {
        if (this.running) return { ok: false, reason: 'already_running' };
        if (!navigator.onLine) {
            this.saveStatus({ ok: false, reason: 'offline', trigger });
            return { ok: false, reason: 'offline' };
        }

        this.running = true;
        try {
            const ready = await this.waitOnlineStore();
            if (!ready) {
                this.saveStatus({ ok: false, reason: 'online_store_not_ready', trigger });
                return { ok: false, reason: 'online_store_not_ready' };
            }

            const initRes = await window.BiletProOnlineStore.init();
            if (!initRes || initRes.mode !== 'online') {
                this.saveStatus({ ok: false, reason: 'online_mode_unavailable', trigger, init: initRes || null });
                return { ok: false, reason: 'online_mode_unavailable' };
            }

            const events = this.getLocalEvents();
            let synced = 0;
            let failed = 0;

            // 1) Local -> Online push
            for (const ev of events) {
                if (!ev || !ev.id) continue;
                try {
                    const res = await window.BiletProOnlineStore.syncLegacyEventBundle(ev);
                    if (res && res.ok) synced++;
                    else failed++;
                } catch (_) {
                    failed++;
                }
            }

            // 2) Online -> Local pull (yeni cihazda merkezi veriyi indirmek için)
            let pullRes = { ok: false, changed: false, count: 0, reason: 'not_supported' };
            if (typeof window.BiletProOnlineStore.pullOnlineToLocal === 'function') {
                pullRes = await window.BiletProOnlineStore.pullOnlineToLocal();
            }

            // 3) Personel verisini online'dan çek
            let staffPullRes = { ok: false, changed: false };
            if (typeof window.BiletProOnlineStore.pullStaffFromOnline === 'function') {
                staffPullRes = await window.BiletProOnlineStore.pullStaffFromOnline();
            }

            // 4) Sistem ayarlarını online'dan çek
            let configPullRes = { ok: false, changed: false };
            if (typeof window.BiletProOnlineStore.pullConfigFromOnline === 'function') {
                configPullRes = await window.BiletProOnlineStore.pullConfigFromOnline();
            }

            // 5) Audit loglarını online'dan çek
            let auditPullRes = { ok: false, changed: false };
            if (typeof window.BiletProOnlineStore.pullAuditToLocal === 'function') {
                auditPullRes = await window.BiletProOnlineStore.pullAuditToLocal(1000);
            }

            // 6) Kontrol paneli CLog reset marker'ını uygula
            let cLogResetRes = { ok: false, changed: false };
            if (typeof window.BiletProOnlineStore.applyRemoteCLogResetIfNeeded === 'function') {
                cLogResetRes = await window.BiletProOnlineStore.applyRemoteCLogResetIfNeeded();
            }

            const anyChanged = !!(pullRes.changed || staffPullRes.changed || configPullRes.changed || auditPullRes.changed || cLogResetRes.changed);
            const requiresReload = !!(pullRes.changed || staffPullRes.changed || configPullRes.changed || cLogResetRes.changed);

            if (auditPullRes.changed) {
                try {
                    window.dispatchEvent(new CustomEvent('biletpro:audit-updated', {
                        detail: {
                            trigger,
                            changed: true
                        }
                    }));
                } catch (_) {}
            }

            // Veri değiştiyse önce sayfaya event gönder; sayfa kendi handle ederse reload gerekmez
            let pageHandledUpdate = false;
            if (anyChanged && requiresReload) {
                try {
                    const dataEvt = new CustomEvent('biletpro:data-updated', {
                        detail: { trigger, changed: anyChanged },
                        cancelable: true
                    });
                    pageHandledUpdate = !window.dispatchEvent(dataEvt); // false = preventDefault çağrıldı
                } catch (_) {}
            }

            const ok = failed === 0 && (pullRes.ok !== false);
            this.saveStatus({
                ok,
                reason: ok ? 'bi_sync_ok' : 'bi_sync_partial',
                trigger,
                total: events.length,
                synced,
                failed,
                pulled: pullRes.count || 0,
                changed: anyChanged,
                staffChanged: !!staffPullRes.changed,
                configChanged: !!configPullRes.changed,
                auditChanged: !!auditPullRes.changed,
                cLogResetChanged: !!cLogResetRes.changed
            });

            // Sayfa kendi handle etmediyse klasik smart reload devreye girer
            if (anyChanged && requiresReload && !pageHandledUpdate) {
                const page = (location.pathname.split('/').pop() || 'index.html').trim() || 'index.html';
                if (page !== 'login.html') {
                    const isRealtime = trigger === 'realtime_events' || trigger === 'realtime_staff';
                    if (isRealtime || sessionStorage.getItem(BILETPRO_SYNC_RELOAD_FLAG) !== '1') {
                        if (!isRealtime) sessionStorage.setItem(BILETPRO_SYNC_RELOAD_FLAG, '1');
                        setTimeout(() => window.bpSmartReload(trigger), 300);
                    }
                }
            }

            return {
                ok,
                total: events.length,
                synced,
                failed,
                pulled: pullRes.count || 0,
                changed: anyChanged
            };
        } finally {
            this.running = false;
        }
    },

    schedule(trigger = 'scheduled', delayMs = 800) {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            this.syncNow(trigger).catch(() => {});
        }, delayMs);
    },

    start() {
        // İlk açılışta
        this.schedule('startup', 1200);

        // İnternet geri gelince otomatik çek (PAT)
        window.addEventListener('online', () => this.schedule('online', 400));

        // Sekmeye geri dönünce tekrar dene
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                const delay = this.isSyncStale(12000) ? 120 : 400;
                this.schedule('visible', delay);
            }
        });

        // Uygulama odak kazanınca (mobil app switch dönüşü dahil) daha taze veri al
        window.addEventListener('focus', () => {
            const delay = this.isSyncStale(12000) ? 120 : 350;
            this.schedule('focus', delay);
        }, { passive: true });

        // BFCache dönüşlerinde stale veri kalmasın
        window.addEventListener('pageshow', (evt) => {
            const isBfCacheRestore = !!(evt && evt.persisted === true);
            const delay = (isBfCacheRestore || this.isSyncStale(15000)) ? 100 : 260;
            this.schedule('pageshow', delay);
        }, { passive: true });

        // Arka planda periyodik emniyet sync
        setInterval(() => this.schedule('interval', 0), 45000);

        // Kuyruktaki audit kayıtlarını da periyodik flush et
        setInterval(() => {
            if (typeof window.flushAuditQueue === 'function') window.flushAuditQueue().catch(() => {});
        }, 12000);

        // Supabase Realtime: events ve app_config tablosu değişince anında sync
        this._startRealtime();
    },

    _startRealtime() {
        const tryConnect = () => {
            if (this._realtimeChannel) return;
            // BiletProOnlineStore hazır ve online modda olana kadar bekle
            if (!window.BiletProOnlineStore || !window.BiletProOnlineStore.client || window.BiletProOnlineStore.mode !== 'online') {
                setTimeout(tryConnect, 2000);
                return;
            }
            try {
                const channel = window.BiletProOnlineStore.client
                    .channel('biletpro-realtime')
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
                        this.schedule('realtime_events', 300);
                    })
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
                        this.schedule('realtime_tickets', 200);
                    })
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'checkins' }, () => {
                        this.schedule('realtime_checkins', 200);
                    })
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_config' }, () => {
                        this.schedule('realtime_staff', 300);
                    })
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, () => {
                        this.schedule('realtime_audit', 300);
                    })
                    .subscribe((status) => {
                        console.info('[BiletPro Realtime]', status);
                    });
                this._realtimeChannel = channel;

                // Supabase Presence: çapraz cihaz masa kilidi
                const sess = JSON.parse(localStorage.getItem('BiletPro_Session') || '{}');
                const presUser = sess.name || sess.username || 'Kullanıcı';
                if (window.BiletProPresence && typeof window.BiletProPresence.init === 'function') {
                    window.BiletProPresence.init(window.BiletProOnlineStore.client, presUser).catch(() => {});
                }
            } catch (e) {
                console.warn('[BiletPro Realtime] bağlantı kurulamadı:', e);
            }
        };
        setTimeout(tryConnect, 3000);
    }
};

window.addEventListener('DOMContentLoaded', () => {
    if (window.BiletProAutoSync && typeof window.BiletProAutoSync.start === 'function') {
        window.BiletProAutoSync.start();
    }
});

// ONLINE STORE KÖPRÜSÜ (çoklu cihaz altyapısı için)
(function ensureOnlineStoreLoaded() {
    if (window.__BiletProOnlineStoreScriptLoaded) return;
    window.__BiletProOnlineStoreScriptLoaded = true;

    const script = document.createElement('script');
    script.src = 'online-store.js?v=20260331';
    script.defer = true;
    script.onerror = () => {
        console.warn('[BiletPro] online-store.js yüklenemedi; local modda devam ediliyor.');
    };
    document.head.appendChild(script);
})();
