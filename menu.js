/**
 * BiletPro | Crystal Silk Official Guard v18.2 (Premium UI + Müşteriler + BİLET SATIŞ)
 * MASTER ADMIN: Hakan | ŞİFRE: 52655265
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
        const username = (user.username || '').toLowerCase();
        const isAdmin = user.role === 'admin' || username === 'hakan';
        if(isAdmin) return true;

        const perms = user.perms || {};
        const pagePermMap = {
            'index.html': 'pManageEvents',
            'gise.html': 'pManageEvents',
            'satis.html': 'pSale',
            'musteriler.html': 'pSale',
            'checkin.html': 'pDoor',
            'personel.html': 'pManageStaff',
            'rapor.html': 'pReports',
            'settings.html': 'pManageStaff'
        };

        const requiredPerm = pagePermMap[page];
        if(!requiredPerm) return true;
        return perms[requiredPerm] === true;
    }

    // 1. MASTER VERİ TANIMI
    const MASTER_USER = {
        name: "Hakan",
        username: "Hakan",
        password: "52655265",
        role: "admin",
        isActive: true,
        perms: {
            pSale: true,
            pDiscount: true,
            pCancel: true,
            pDoor: true,
            pDoorPay: true,
            pDoorRisk: true,
            pManageEvents: true,
            pReports: true,
            pManageStaff: true,
            pViewLogs: true
        }
    };

    // 2. OTURUM KONTROLÜ
    let session = safeJSONParse(localStorage.getItem('BiletPro_Session'));
    const path = window.location.pathname;
    const rawPage = path.split("/").pop();
    const currentPage = rawPage && rawPage.trim() ? rawPage.trim() : 'index.html';

    if (!session && currentPage !== 'login.html') {
        window.location.href = 'login.html';
        return;
    }

    // 3. PERSONEL VERİTABANINA HAKAN'I ÇAK
    let staffData = safeJSONParse(localStorage.getItem('BiletPro_Staff'), []) || [];
    const masterIdx = staffData.findIndex(
        s => normalizeUsername(s && s.username) === normalizeUsername(MASTER_USER.username)
    );
    if (masterIdx === -1) {
        staffData.push({ ...MASTER_USER });
        localStorage.setItem('BiletPro_Staff', JSON.stringify(staffData));
    } else {
        const existing = staffData[masterIdx] || {};
        staffData[masterIdx] = {
            ...existing,
            password: MASTER_USER.password,
            role: 'admin',
            isActive: true,
            perms: { ...(existing.perms || {}), ...(MASTER_USER.perms || {}) }
        };
        localStorage.setItem('BiletPro_Staff', JSON.stringify(staffData));
    }

    // 4. OTURUM KULLANICISI GERÇEKTEN VAR MI / AKTİF Mİ / YETKİLİ Mİ?
    if (session && currentPage !== 'login.html') {
        const sessionUsername = normalizeUsername(session.username);
        const sessionRole = String(session.role || '').trim().toLowerCase();
        const currentUser = staffData.find(
            s => normalizeUsername(s && s.username) === sessionUsername
        );

        const currentUserRole = String((currentUser && currentUser.role) || '').trim().toLowerCase();
        const isSessionAdmin = sessionRole === 'admin' || currentUserRole === 'admin' || sessionUsername === 'hakan';

        if (!isSessionAdmin) {
            const isAllowed = currentUser && currentUser.isActive !== false && hasRequiredPermission(currentUser, currentPage);
            if (!isAllowed) {
                localStorage.removeItem('BiletPro_Session');
                window.location.href = 'login.html';
                return;
            }
        }
    }
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
        supabaseUrl: 'https://iisjexomwopcxwqeabei.supabase.co',
        supabaseAnonKey: 'sb_publishable_jWJDGWClbtosoQeO_gebxQ_P-o24Ne2',
        projectRef: 'iisjexomwopcxwqeabei'
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
    }
};

function safeJSON(raw, fallback = null) {
    try { return JSON.parse(raw); } catch(_) { return fallback; }
}

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
    .toast-container { position: fixed; top: 30px; right: 30px; z-index: 9999999; display: flex; flex-direction: column; gap: 12px; pointer-events: none; }
    .toast-silk { 
        background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(20px); border: 1px solid rgba(226, 232, 240, 0.8); 
        padding: 16px 24px; border-radius: 20px; box-shadow: 0 15px 40px rgba(0,0,0,0.08); 
        display: flex; align-items: center; gap: 14px; transform: translateX(120%); opacity: 0; 
        transition: all 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55); font-family: 'Plus Jakarta Sans', sans-serif;
    }
    .toast-silk.show { transform: translateX(0); opacity: 1; }
    .toast-icon { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 14px; }
    .toast-success .toast-icon { background: #dcfce7; color: #16a34a; }
    .toast-error .toast-icon { background: #fee2e2; color: #ef4444; }
    .toast-info .toast-icon { background: #e0e7ff; color: #4f46e5; }
    .toast-text { font-size: 13px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;}

    /* Confirm Kutusu (Ekranın ortasında cam efektli) */
    .confirm-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(10px); z-index: 9999999; display: flex; align-items: center; justify-content: center; opacity: 0; transition: 0.3s; pointer-events: none; }
    .confirm-overlay.show { opacity: 1; pointer-events: all; }
    .confirm-box { background: #fff; border-radius: 36px; padding: 45px 35px; width: 100%; max-width: 400px; text-align: center; box-shadow: 0 30px 60px rgba(0,0,0,0.15); transform: scale(0.95); transition: 0.3s cubic-bezier(0.16, 1, 0.3, 1); font-family: 'Plus Jakarta Sans', sans-serif; }
    .confirm-overlay.show .confirm-box { transform: scale(1); }
    .confirm-icon { width: 65px; height: 65px; background: #fee2e2; color: #ef4444; border-radius: 22px; display: flex; align-items: center; justify-content: center; font-size: 32px; margin: 0 auto 25px; font-weight: bold;}
    .confirm-title { font-size: 20px; font-weight: 900; color: #0f172a; margin-bottom: 12px; text-transform: uppercase; tracking-tight; }
    .confirm-desc { font-size: 13px; font-weight: 600; color: #64748b; margin-bottom: 35px; line-height: 1.6; }
    .confirm-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
    .btn-c-cancel { padding: 16px; border-radius: 18px; background: #f1f5f9; color: #475569; font-weight: 800; font-size: 11px; text-transform: uppercase; border: none; cursor: pointer; transition: 0.2s; }
    .btn-c-cancel:hover { background: #e2e8f0; }
    .btn-c-confirm { padding: 16px; border-radius: 18px; background: #ef4444; color: #fff; font-weight: 800; font-size: 11px; text-transform: uppercase; border: none; cursor: pointer; transition: 0.3s; box-shadow: 0 10px 25px rgba(239, 68, 68, 0.25); }
    .btn-c-confirm:hover { transform: translateY(-3px); box-shadow: 0 15px 30px rgba(239, 68, 68, 0.4); }
`;
document.head.appendChild(uiStyles);

window.addEventListener('DOMContentLoaded', () => {
    const toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    toastContainer.id = 'globalToastContainer';
    document.body.appendChild(toastContainer);

    if(typeof applyGlobalConfig === 'function') {
        applyGlobalConfig();
    }
});

// KULLANIM: showToast("İşlem Başarılı", "success") veya "error" / "info"
window.showToast = function(message, type = 'info') {
    const container = document.getElementById('globalToastContainer');
    if(!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-silk toast-${type}`;
    let iconHtml = 'i';
    if(type === 'success') iconHtml = '✓';
    if(type === 'error') iconHtml = '!';

    toast.innerHTML = `<div class="toast-icon">${iconHtml}</div><div class="toast-text">${message}</div>`;
    container.appendChild(toast);
    
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
    }, 3500);
}

// KULLANIM: showConfirm("SİL?", "Emin misin?", () => { silme_kodları_buraya })
window.showConfirm = function(title, description, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
        <div class="confirm-box">
            <div class="confirm-icon">!</div>
            <div class="confirm-title">${title}</div>
            <div class="confirm-desc">${description}</div>
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

    // Online mod açıksa merkezi audit tablosuna da yaz
    if(window.BiletProOnlineStore && typeof window.BiletProOnlineStore.writeAudit === 'function') {
        (async () => {
            try {
                if(window.BiletProOnlineStore.getMode && window.BiletProOnlineStore.getMode() === 'online') {
                    await window.BiletProOnlineStore.writeAudit(module, action, details, session);
                }
            } catch (err) {
                console.warn('[BiletPro] online audit yazımı başarısız:', err);
            }
        })();
    }
}

/* ==========================================
   SOL MENÜ ENJEKSİYONU (SQUEEZE YAPISI)
   ========================================== */
function injectMenu(active = 'dashboard', eventId = null) {
    const session = JSON.parse(localStorage.getItem('BiletPro_Session')) || { name: "Misafir", role: "user" };
    const isAdmin = session.role === 'admin' || (session.username || '').toLowerCase() === 'hakan';
    const roleLabel = isAdmin ? 'YÖNETİCİ' : 'PERSONEL';
    const roleClass = isAdmin ? 'admin' : 'user';
    const cfg = window.BiletProCore.getConfig();
    const labels = cfg.menuLabels || {};
    const visibility = cfg.menuVisibility || {};

    const style = document.createElement('style');
    style.innerHTML = `
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
        :root { --sb-c: 95px; --sb-e: 280px; --silk-accent: #2563eb; --silk-text: #0f172a; }
        html, body { height: 100%; margin: 0; padding: 0 !important; overflow: hidden; background: #f4f7fa; }

        /* ÖNEMLİ DEĞİŞİKLİK: flex-row body yapısında içerik alanı doğru genişliği alsın */
        body { display: flex !important; flex-direction: row !important; font-family: 'Plus Jakarta Sans', sans-serif !important; }

        /* Sidebar'ın yanındaki tüm doğrudan body çocukları (sidebar hariç) flex-1 olsun */
        body > *:not(.sidebar-silk) { flex: 1; min-width: 0; overflow: hidden; }

        .sidebar-silk { width: var(--sb-c); height: 100vh; background: rgba(255, 255, 255, 0.98); backdrop-filter: blur(40px); border-right: 1px solid #e2e8f0; display: flex; flex-direction: column; align-items: center; padding: 40px 0; z-index: 100000; transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1); flex-shrink: 0; overflow: hidden; position: relative; }
        .sidebar-silk.expanded { width: var(--sb-e); align-items: flex-start; overflow-y: auto; overflow-x: hidden; }
        .menu-btn { position: absolute; top: 40px; width: 56px; height: 56px; border-radius: 18px; background: #fff; border: 1px solid #e2e8f0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; cursor: pointer; transition: 0.3s; box-shadow: 0 4px 15px rgba(0,0,0,0.05); z-index: 10; }
        .sidebar-silk.expanded .menu-btn { left: 20px; transform: none; }
        .sidebar-silk:not(.expanded) .menu-btn { left: 50%; transform: translateX(-50%); }
        .m-line { width: 22px; height: 2.5px; background: var(--silk-text); border-radius: 5px; transition: 0.3s; }
        .expanded .l1 { transform: translateY(7.5px) rotate(45deg); }
        .expanded .l2 { opacity: 0; }
        .expanded .l3 { transform: translateY(-7.5px) rotate(-45deg); }
        .nav-list { width: 100%; flex: 1; display: flex; flex-direction: column; padding-top: 80px; }
        .nav-link { width: 100%; display: flex; align-items: center; padding: 6px 35px; color: #64748b; text-decoration: none; transition: 0.2s; position: relative; white-space: nowrap; }
        .nav-link i { font-size: 20px; min-width: 22px; text-align: center; font-style: normal; }
        .nav-txt { font-size: 9px; font-weight: 800; text-transform: uppercase; margin-left: 18px; letter-spacing: 1.2px; color: var(--silk-text); opacity: 0; visibility: hidden; transition: 0.3s; }
        .expanded .nav-txt { opacity: 1; visibility: visible; }
        .nav-link.active { color: var(--silk-accent); background: rgba(37, 99, 235, 0.04); }
        .nav-link.active::before { content: ''; position: absolute; left: 0; top: 15%; bottom: 15%; width: 5px; background: var(--silk-accent); border-radius: 0 5px 5px 0; }
        main, .main-content { flex: 1; height: 100vh; overflow-y: auto; background: #f4f7fa; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); position: relative; }
        .u-sec { width: 100%; padding: 20px; border-top: 1px solid #e2e8f0; opacity: 0; visibility: hidden; transition: 0.3s; background: #f8fafc; display: none; max-height: 42vh; overflow-y: auto; }
        .expanded .u-sec { opacity: 1; visibility: visible; display: block; }
        .u-n { font-size: 12px; font-weight: 800; color: var(--silk-text); text-transform: uppercase; display: block; margin-bottom: 8px; }
        .out-btn { width: 100%; background: #fff; color: #ef4444; border: 1px solid #fee2e2; padding: 10px; border-radius: 14px; cursor: pointer; font-weight: 900; font-size: 9px; display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 8px; }
        .quick-actions { width: 100%; padding: 12px; border-top: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: center; }
        .quick-logout { width: 56px; height: 42px; border-radius: 14px; background: #fff; border: 1px solid #fee2e2; color: #ef4444; font-size: 18px; font-weight: 900; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.04); transition: 0.2s; }
        .quick-logout:hover { transform: translateY(-2px); background: #fff1f2; }
        .sidebar-silk.expanded .quick-actions { display: none; }

        .bp-top-meta {
            position: fixed;
            top: 12px;
            right: 14px;
            left: auto;
            z-index: 100050;
            display: flex;
            align-items: center;
            gap: 10px;
            background: linear-gradient(135deg, rgba(255,255,255,0.95), rgba(248,250,252,0.92));
            border: 1px solid #dbeafe;
            box-shadow: 0 12px 32px rgba(2, 6, 23, 0.12);
            border-radius: 18px;
            padding: 8px 10px 8px 9px;
            backdrop-filter: blur(18px);
        }
        .bp-top-meta.inline-mode {
            position: static;
            top: auto;
            left: auto;
            right: auto;
            z-index: auto;
            margin-left: auto;
            margin-right: 12px;
            flex-shrink: 0;
        }
        .bp-top-avatar {
            width: 34px;
            height: 34px;
            border-radius: 12px;
            background: linear-gradient(135deg, #1e3a8a, #2563eb);
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 900;
            letter-spacing: .5px;
            box-shadow: 0 6px 16px rgba(37, 99, 235, 0.35);
        }
        .bp-top-info { display: flex; flex-direction: column; gap: 2px; min-width: 96px; }
        .bp-top-user { font-size: 11px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: .7px; line-height: 1; }
        .bp-top-role { width: fit-content; font-size: 9px; font-weight: 900; letter-spacing: .8px; border-radius: 999px; padding: 3px 8px; line-height: 1; }
        .bp-top-role.admin { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
        .bp-top-role.user { background: #f8fafc; color: #334155; border: 1px solid #e2e8f0; }
        .bp-top-time {
            font-size: 12px;
            font-weight: 900;
            color: #1d4ed8;
            letter-spacing: .9px;
            background: #eef2ff;
            border: 1px solid #c7d2fe;
            border-radius: 12px;
            padding: 7px 10px;
            line-height: 1;
        }

        @media (max-width: 1023px) {
            :root { --sb-c: 76px; }
            .sidebar-silk { padding: 18px 0; }
            .menu-btn { top: 16px; }
            .nav-list { padding-top: 64px; }
            .sidebar-silk.expanded {
                position: fixed;
                left: 0;
                top: 0;
                bottom: 0;
                width: min(86vw, 320px);
                box-shadow: 20px 0 50px rgba(0,0,0,0.12);
            }
            .u-sec { max-height: 52vh; }
            .bp-top-meta {
                top: 10px;
                right: 10px;
                left: auto;
                padding: 6px 8px 6px 7px;
                gap: 8px;
            }
            .bp-top-meta.inline-mode {
                margin-left: auto;
                margin-right: 8px;
            }
            .bp-top-avatar { width: 30px; height: 30px; border-radius: 10px; font-size: 11px; }
            .bp-top-user { font-size: 10px; }
            .bp-top-role { font-size: 8px; padding: 2px 6px; }
            .bp-top-time { font-size: 10px; padding: 6px 8px; }
        }
    `;
    document.head.appendChild(style);

    const eventParams = eventId ? `?id=${eventId}` : '';
    
    const menuItems = [
        { id: 'dashboard', label: labels.dashboard || 'DASHBOARD', icon: '📊', url: 'index.html', show: visibility.dashboard !== false },
        { id: 'gise', label: labels.gise || 'GİŞE & MİMARİ', icon: '🎫', url: `gise.html${eventParams}`, show: visibility.gise !== false },
        { id: 'satis', label: labels.satis || 'BİLET SATIŞ', icon: '💰', url: `satis.html${eventParams}`, show: visibility.satis !== false },
        { id: 'musteriler', label: labels.musteriler || 'MÜŞTERİLER', icon: '👥', url: `musteriler.html${eventParams}`, show: visibility.musteriler !== false },
        { id: 'checkin', label: labels.checkin || 'KAPI KONTROL', icon: '🛡️', url: `checkin.html${eventParams}`, show: visibility.checkin !== false },
        { id: 'personel', label: labels.personel || 'PERSONEL', icon: '🔑', url: 'personel.html', show: isAdmin && visibility.personel !== false },
        { id: 'report', label: labels.report || 'RAPORLAR', icon: '📈', url: 'rapor.html', show: isAdmin && visibility.report !== false },
        { id: 'settings', label: labels.settings || 'SİSTEM AYARLARI', icon: '⚙️', url: 'settings.html', show: isAdmin && visibility.settings !== false }
    ];

    let html = `
        <nav class="sidebar-silk" id="proSidebar">
            <div class="menu-btn" onclick="toggleProSidebar()">
                <div class="m-line l1"></div><div class="m-line l2"></div><div class="m-line l3"></div>
            </div>
            <div class="nav-list">
                ${menuItems.filter(i => i.show).map(i => `
                    <a href="${i.url}" class="nav-link ${active === i.id ? 'active' : ''}">
                        <i>${i.icon}</i><span class="nav-txt">${i.label}</span>
                    </a>
                `).join('')}
            </div>
            <div class="u-sec">
                <span class="u-n">${session.name}</span>
                <button onclick="logout(event)" class="out-btn"><i>🚪</i> ÇIKIŞ</button>
                <button onclick="openGuide()" class="out-btn" style="background:#0f172a;color:#fff;"><i>📘</i> KILAVUZ</button>
                ${isAdmin ? '<button onclick="openSystemSettings()" class="out-btn" style="background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe;"><i>⚙️</i> AYARLAR</button>' : ''}
                <button onclick="backupAllData()" class="out-btn"><i>💾</i> YEDEK AL</button>
                <button onclick="triggerRestoreDialog()" class="out-btn"><i>📥</i> GERİ YÜKLE</button>
                <button onclick="resetDemoData()" class="out-btn" style="background:#fff7ed;color:#c2410c;border-color:#fed7aa;"><i>🧪</i> DEMO SIFIRLA</button>
            </div>
            <div class="quick-actions">
                <button onclick="logout(event)" class="quick-logout" title="ÇIKIŞ">🚪</button>
            </div>
        </nav>
        <div class="bp-top-meta" id="bpTopMeta">
            <div class="bp-top-avatar" id="bpTopAvatar">${String((session.name || 'M').trim().charAt(0) || 'M').toUpperCase()}</div>
            <div class="bp-top-info">
                <span class="bp-top-user" id="bpTopUser">${session.name || 'Misafir'}</span>
                <span class="bp-top-role ${roleClass}" id="bpTopRole">${roleLabel}</span>
            </div>
            <span class="bp-top-time" id="bpTopClock">--:--:--</span>
        </div>
    `;
    document.body.insertAdjacentHTML('afterbegin', html);

    // Dashboard özel: Rozeti '+ YENİ ETKİNLİK' butonunun hemen soluna yerleştir
    // Not: injectMenu bazı sayfalarda header'dan önce çalıştığı için retry gerekir.
    if (active === 'dashboard') {
        let tries = 0;
        const placeMetaNearCreateButton = () => {
            tries += 1;
            const topMeta = document.getElementById('bpTopMeta');
            const newEventBtn = document.querySelector('header button[onclick="openModal()"]');

            if (topMeta && newEventBtn && newEventBtn.parentElement) {
                topMeta.classList.add('inline-mode');
                newEventBtn.parentElement.insertBefore(topMeta, newEventBtn);
                return;
            }

            if (tries < 40) setTimeout(placeMetaNearCreateButton, 100);
        };

        setTimeout(placeMetaNearCreateButton, 0);
    }

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
            <div id="guideModal" class="fixed inset-0 hidden z-[99999] bg-slate-900/70 flex items-center justify-center p-6">
                <div class="bg-white w-full max-w-2xl p-7 rounded-3xl shadow-2xl overflow-y-auto max-h-[90vh]">
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-lg font-black uppercase">BiletPro Kullanım Kılavuzu</h2>
                        <button onclick="closeGuide()" class="text-xl font-black">&times;</button>
                    </div>
                    <ol class="pl-4 list-decimal text-xs text-slate-700 leading-6">
                        <li><strong>Dashboard</strong>: Etkinlik ekle, düzenle, sil, pasif/aktif geçiş yap.</li>
                        <li><strong>Gişe</strong>: Kategori ve masa üretimi, masayı sat veya iptal işlemleri.</li>
                        <li><strong>Satış</strong>: Müşteri seç, masa seç, indirim uygula (izin varsa), tahsilat kaydet.</li>
                        <li><strong>Kapı</strong>: QR okut ve "Kaç kişi giriyor?" sorusunu kullan. Borçlu geçiş için yetki gereklidir.</li>
                        <li><strong>Müşteriler</strong>: CRM verilerini izle; aynı numara + farklı isim ayrı müşteri olur.</li>
                        <li><strong>Personel</strong>: Yetki matrisi ataması (Satış, İndirim, İptal, Kapı, Tahsilat, Risk vb).</li>
                        <li><strong>Audit</strong>: Her işlem otomatik kaydedilir; açılan pencereden CSV indirilebilir.</li>
                        <li><strong>Çıkış</strong>: Güvenli oturum kapatma.</li>
                    </ol>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', guideHtml);
    }
}

window.openGuide = function() { const m = document.getElementById('guideModal'); if(m) m.classList.remove('hidden'); }
window.closeGuide = function() { const m = document.getElementById('guideModal'); if(m) m.classList.add('hidden'); }
window.openSystemSettings = function() {
    const session = JSON.parse(localStorage.getItem('BiletPro_Session') || '{}');
    const isAdmin = session.role === 'admin' || (session.username || '').toLowerCase() === 'hakan';
    if (!isAdmin) {
        if (typeof showToast === 'function') showToast('Sistem ayarları sadece yöneticiye açıktır.', 'error');
        return;
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
        window.location.href = 'login.html';
    });
}

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
            if (typeof window.BiletProOnlineStore.pullStaffFromOnline === 'function') {
                await window.BiletProOnlineStore.pullStaffFromOnline();
            }

            // 4) Sistem ayarlarını online'dan çek
            if (typeof window.BiletProOnlineStore.pullConfigFromOnline === 'function') {
                await window.BiletProOnlineStore.pullConfigFromOnline();
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
                changed: !!pullRes.changed
            });

            // Veri değiştiyse sayfayı yenile
            // Realtime tetiklemelerinde flag kontrolü yok (her değişiklikte reload)
            // Startup/interval tetiklemelerinde ilk reload'dan sonra tekrar etme
            if (pullRes.changed) {
                const page = (location.pathname.split('/').pop() || 'index.html').trim() || 'index.html';
                if (page !== 'login.html') {
                    const isRealtime = trigger === 'realtime_events' || trigger === 'realtime_staff';
                    if (isRealtime || sessionStorage.getItem(BILETPRO_SYNC_RELOAD_FLAG) !== '1') {
                        if (!isRealtime) sessionStorage.setItem(BILETPRO_SYNC_RELOAD_FLAG, '1');
                        setTimeout(() => window.location.reload(), 300);
                    }
                }
            }

            return {
                ok,
                total: events.length,
                synced,
                failed,
                pulled: pullRes.count || 0,
                changed: !!pullRes.changed
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
            if (document.visibilityState === 'visible') this.schedule('visible', 400);
        });

        // Arka planda periyodik emniyet sync
        setInterval(() => this.schedule('interval', 0), 45000);

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
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_config' }, () => {
                        this.schedule('realtime_staff', 300);
                    })
                    .subscribe((status) => {
                        console.info('[BiletPro Realtime]', status);
                    });
                this._realtimeChannel = channel;
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
    script.src = 'online-store.js?v=20260329';
    script.defer = true;
    script.onerror = () => {
        console.warn('[BiletPro] online-store.js yüklenemedi; local modda devam ediliyor.');
    };
    document.head.appendChild(script);
})();