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
            'index.html': null, // Dashboard: herkes görebilir, yönetim butonları index.html içinde kontrol edilir
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

    function getFirstAllowedPage(user) {
        if (!user) return null;
        // Dashboard (index.html) herkese açık; etkinlik seçim merkezi
        return 'index.html';
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
    },
    security: {
        settingsPin: '52655265'
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
        .nav-list { width: 100%; flex: 1; display: flex; flex-direction: column; padding-top: 8px; }
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

        .sb-user-badge {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 10px 0 14px;
            margin-top: 96px;
            border-bottom: 1px solid #e2e8f0;
            flex-shrink: 0;
            overflow: hidden;
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .sidebar-silk.expanded .sb-user-badge {
            justify-content: flex-start;
            padding: 10px 20px 14px;
            gap: 10px;
        }
        .sb-user-info {
            display: none;
            flex-direction: column;
            gap: 4px;
            min-width: 0;
            overflow: hidden;
        }
        .sidebar-silk.expanded .sb-user-info { display: flex; }
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
            .sb-user-badge { margin-top: 72px; }
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
            <div class="sb-user-badge">
                <div class="bp-top-avatar" id="bpTopAvatar">${String((session.name || 'M').trim().charAt(0) || 'M').toUpperCase()}</div>
                <div class="sb-user-info">
                    <span class="bp-top-user" id="bpTopUser">${session.name || 'Misafir'}</span>
                    <span class="bp-top-role ${roleClass}" id="bpTopRole">${roleLabel}</span>
                    <span class="bp-top-time" id="bpTopClock">--:--:--</span>
                </div>
            </div>
            <div class="nav-list">
                ${menuItems.filter(i => i.show).map(i => `
                    <a href="${i.id === 'settings' ? '#' : i.url}" ${i.id === 'settings' ? 'onclick="event.preventDefault(); openSystemSettings();"' : ''} class="nav-link ${active === i.id ? 'active' : ''}">
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
    `;
    document.body.insertAdjacentHTML('afterbegin', html);

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
const BILETPRO_SETTINGS_PIN_SESSION_KEY = 'BiletPro_SettingsPinUntil';

function hasValidSettingsPinSession() {
    const until = parseInt(sessionStorage.getItem(BILETPRO_SETTINGS_PIN_SESSION_KEY) || '0', 10) || 0;
    return until > Date.now();
}

function getSettingsPin() {
    const cfg = window.BiletProCore.getConfig();
    return String((cfg && cfg.security && cfg.security.settingsPin) || '52655265').trim();
}

function requestSettingsPinModal() {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay show';
        overlay.innerHTML = `
            <div class="confirm-box" style="max-width:460px; text-align:left;">
                <div class="confirm-title" style="font-size:18px; margin-bottom:8px;">AYARLAR PIN DOĞRULAMA</div>
                <div class="confirm-desc" style="margin-bottom:14px;">Sistem ayarlarına girmek için yönetici PIN kodunu girin.</div>
                <input id="settingsPinInput" type="password" placeholder="PIN" style="width:100%;padding:12px 14px;border:1px solid #cbd5e1;border-radius:12px;font-weight:800;font-size:14px;outline:none;" />
                <div id="settingsPinErr" style="display:none;margin-top:8px;font-size:12px;font-weight:800;color:#dc2626;">PIN yanlış.</div>
                <div class="confirm-actions" style="margin-top:16px;">
                    <button class="btn-c-cancel" id="settingsPinCancel">VAZGEÇ</button>
                    <button class="btn-c-confirm" id="settingsPinConfirm" style="background:#2563eb;box-shadow:0 10px 25px rgba(37,99,235,.25);">DOĞRULA</button>
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
            if (typed && typed === getSettingsPin()) {
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
    const isAdmin = session.role === 'admin' || (session.username || '').toLowerCase() === 'hakan';
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

            // Veri değiştiyse sayfayı yenile
            // Realtime tetiklemelerinde flag kontrolü yok (her değişiklikte reload)
            // Startup/interval tetiklemelerinde ilk reload'dan sonra tekrar etme
            if (anyChanged && requiresReload) {
                const page = (location.pathname.split('/').pop() || 'index.html').trim() || 'index.html';
                if (page !== 'login.html') {
                    const isRealtime = trigger === 'realtime_events' || trigger === 'realtime_staff';
                    const forceReloadForConfigOrStaff = !!(configPullRes.changed || staffPullRes.changed || auditPullRes.changed || cLogResetRes.changed);
                    if (isRealtime || forceReloadForConfigOrStaff || sessionStorage.getItem(BILETPRO_SYNC_RELOAD_FLAG) !== '1') {
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
            if (document.visibilityState === 'visible') this.schedule('visible', 400);
        });

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