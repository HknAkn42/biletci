/*
 * BiletPro Online Store Bridge v1
 * - Varsayılan: localStorage
 * - Online: Supabase (config varsa)
 */
(function () {
    const ONLINE_CACHE_KEY = 'BiletPro_OnlineRuntime';
    const DELETED_EVENTS_KEY = 'BiletPro_DeletedEvents';

    function getLocalDeletedIds() {
        try {
            const raw = localStorage.getItem(DELETED_EVENTS_KEY) || '[]';
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr.map((x) => String(x)).filter(Boolean) : [];
        } catch (_) {
            return [];
        }
    }

    function saveLocalDeletedIds(ids) {
        try {
            const merged = Array.from(new Set([...(getLocalDeletedIds() || []), ...(ids || []).map((x) => String(x)).filter(Boolean)]));
            localStorage.setItem(DELETED_EVENTS_KEY, JSON.stringify(merged));
            return merged;
        } catch (_) {
            return getLocalDeletedIds();
        }
    }

    function getCoreConfig() {
        if (window.BiletProCore && typeof window.BiletProCore.getConfig === 'function') {
            return window.BiletProCore.getConfig();
        }
        return {
            online: {
                enabled: false,
                provider: 'supabase',
                supabaseUrl: '',
                supabaseAnonKey: '',
                projectRef: ''
            }
        };
    }

    function getOnlineConfig() {
        const cfg = getCoreConfig();
        return cfg.online || {};
    }

    function isSupabaseReady(onlineCfg) {
        return Boolean(
            onlineCfg &&
            onlineCfg.enabled === true &&
            onlineCfg.provider === 'supabase' &&
            onlineCfg.supabaseUrl &&
            onlineCfg.supabaseAnonKey
        );
    }

    async function loadSupabaseClient() {
        if (window.supabase && window.supabase.createClient) return true;

        const existing = document.querySelector('script[data-biletpro-supabase="1"]');
        if (existing) {
            await new Promise((resolve) => {
                if (window.supabase && window.supabase.createClient) return resolve();
                existing.addEventListener('load', resolve, { once: true });
                existing.addEventListener('error', resolve, { once: true });
            });
            return !!(window.supabase && window.supabase.createClient);
        }

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        script.setAttribute('data-biletpro-supabase', '1');

        const loaded = await new Promise((resolve) => {
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.head.appendChild(script);
        });

        return loaded && !!(window.supabase && window.supabase.createClient);
    }

    const OnlineStore = {
        client: null,
        mode: 'local',
        _initPromise: null,

        normalizeEventDate(raw) {
            if (!raw) return null;
            const d = new Date(raw);
            if (Number.isNaN(d.getTime())) return null;
            return d.toISOString().slice(0, 10);
        },

        async init() {
            if (this.client && this.mode === 'online') {
                return { ok: true, mode: this.mode, reason: 'already_initialized' };
            }
            if (this._initPromise) return this._initPromise;

            this._initPromise = (async () => {
            const onlineCfg = getOnlineConfig();
            if (!isSupabaseReady(onlineCfg)) {
                this.mode = 'local';
                return { ok: true, mode: this.mode };
            }

            const loaded = await loadSupabaseClient();
            if (!loaded) {
                this.mode = 'local';
                return { ok: false, mode: this.mode, reason: 'supabase_lib_load_failed' };
            }

            try {
                if (window.__BiletProSupabaseClient) {
                    this.client = window.__BiletProSupabaseClient;
                } else {
                    this.client = window.supabase.createClient(onlineCfg.supabaseUrl, onlineCfg.supabaseAnonKey, {
                        auth: {
                            persistSession: false,
                            autoRefreshToken: false,
                            detectSessionInUrl: false
                        }
                    });
                    window.__BiletProSupabaseClient = this.client;
                }
                this.mode = 'online';
                localStorage.setItem(ONLINE_CACHE_KEY, JSON.stringify({ mode: this.mode, lastInit: new Date().toISOString() }));
                return { ok: true, mode: this.mode };
            } catch (err) {
                console.error('[BiletPro OnlineStore] init error:', err);
                this.mode = 'local';
                return { ok: false, mode: this.mode, reason: 'client_create_failed' };
            }
            })();

            try {
                return await this._initPromise;
            } finally {
                this._initPromise = null;
            }
        },

        getMode() {
            return this.mode;
        },

        async getDeletedEventIds() {
            const localDeleted = getLocalDeletedIds();
            if (this.mode !== 'online' || !this.client) return localDeleted;
            const { data, error } = await this.client
                .from('app_config')
                .select('value')
                .eq('key', DELETED_EVENTS_KEY)
                .maybeSingle();

            if (error || !data?.value || !Array.isArray(data.value)) return localDeleted;
            const onlineDeleted = data.value.map((x) => String(x));
            return Array.from(new Set([...(localDeleted || []), ...(onlineDeleted || [])]));
        },

        async markEventsDeleted(ids) {
            const list = Array.isArray(ids) ? ids.map((x) => String(x)).filter(Boolean) : [];
            if (!list.length) return { ok: true, reason: 'no_ids' };

            // Önce local tombstone'a yaz (offline durumda bile geri dirilmeyi engeller)
            const localMerged = saveLocalDeletedIds(list);

            if (this.mode !== 'online' || !this.client) {
                return { ok: true, reason: 'local_only', count: localMerged.length };
            }

            const existing = await this.getDeletedEventIds();
            const merged = Array.from(new Set([...(existing || []), ...list]));

            const { error } = await this.client
                .from('app_config')
                .upsert({ key: DELETED_EVENTS_KEY, value: merged }, { onConflict: 'key' });

            if (error) {
                console.error('[BiletPro OnlineStore] markEventsDeleted error:', error);
                return { ok: true, reason: 'local_only_online_failed', count: localMerged.length };
            }
            return { ok: true, count: merged.length };
        },

        // Aşama 1: read/write fallback API (sayfalar kademeli taşıyacak)
        async getEvents() {
            if (this.mode !== 'online' || !this.client) {
                return JSON.parse(localStorage.getItem('EventPro_DB_Ultimate_Final') || '[]');
            }

            const { data, error } = await this.client
                .from('events')
                .select('*')
                .order('event_date', { ascending: false });

            if (error) {
                console.error('[BiletPro OnlineStore] getEvents error:', error);
                return JSON.parse(localStorage.getItem('EventPro_DB_Ultimate_Final') || '[]');
            }
            return data || [];
        },

        async pullOnlineToLocal() {
            if (this.mode !== 'online' || !this.client) {
                return { ok: false, reason: 'offline_mode', changed: false, count: 0 };
            }

            const { data, error } = await this.client
                .from('events')
                .select('legacy_event_id, payload_json, updated_at')
                .order('updated_at', { ascending: false });

            if (error) {
                console.error('[BiletPro OnlineStore] pullOnlineToLocal error:', error);
                return { ok: false, reason: 'fetch_failed', changed: false, count: 0 };
            }

            const rows = data || [];
            const deletedIds = new Set(await this.getDeletedEventIds());
            const onlineEvents = [];

            rows.forEach((r) => {
                const p = r && r.payload_json;
                if (p && typeof p === 'object' && p.id) {
                    if (deletedIds.has(String(p.id))) return;
                    onlineEvents.push(p);
                } else if (r && r.legacy_event_id) {
                    if (deletedIds.has(String(r.legacy_event_id))) return;
                    onlineEvents.push({ id: String(r.legacy_event_id), title: 'Etkinlik', categories: [], isActive: true });
                }
            });

            // Mevcut local veriyle merge: her etkinlik için masa bazlı birleştir
            const localRaw = localStorage.getItem('EventPro_DB_Ultimate_Final') || '[]';
            const localEvents = JSON.parse(localRaw);

            const mergedMap = {};

            // Önce online veriyi yükle
            onlineEvents.forEach(ev => { mergedMap[String(ev.id)] = ev; });

            // Local'deki satış verilerini online üzerine bindir.
            // DİKKAT: Online'da olmayan event localden geri eklenmez (silinen eventin dirilmesini önler).
            localEvents.forEach(localEv => {
                const key = String(localEv.id);
                if (deletedIds.has(key)) { return; }
                if (!mergedMap[key]) { return; }
                const onlineEv = mergedMap[key];
                // Kategori bazlı masa merge (UNION): online + local birlikte korunur
                const onlineCats = Array.isArray(onlineEv.categories) ? onlineEv.categories : [];
                const localCats = Array.isArray(localEv.categories) ? localEv.categories : [];
                const catMap = {};

                onlineCats.forEach((c) => { if (c && c.id !== undefined && c.id !== null) catMap[String(c.id)] = c; });
                localCats.forEach((c) => { if (c && c.id !== undefined && c.id !== null && !catMap[String(c.id)]) catMap[String(c.id)] = c; });

                const mergedCats = Object.values(catMap).map((baseCat) => {
                    const cid = String(baseCat.id);
                    const onlineCat = onlineCats.find(c => String(c.id) === cid) || null;
                    const localCat = localCats.find(c => String(c.id) === cid) || null;

                    if (!onlineCat && localCat) return localCat;
                    if (onlineCat && !localCat) return onlineCat;

                    const onlineMasalar = Array.isArray(onlineCat.masalar) ? onlineCat.masalar : [];
                    const localMasalar = Array.isArray(localCat.masalar) ? localCat.masalar : [];
                    const masaMap = {};

                    onlineMasalar.forEach((m) => { if (m && m.id !== undefined && m.id !== null) masaMap[String(m.id)] = m; });
                    localMasalar.forEach((m) => { if (m && m.id !== undefined && m.id !== null && !masaMap[String(m.id)]) masaMap[String(m.id)] = m; });

                    const mergedMasalar = Object.values(masaMap).map((baseMasa) => {
                        const mid = String(baseMasa.id);
                        const onlineMasa = onlineMasalar.find(m => String(m.id) === mid) || null;
                        const localMasa = localMasalar.find(m => String(m.id) === mid) || null;

                        if (!onlineMasa && localMasa) return localMasa;
                        if (onlineMasa && !localMasa) return onlineMasa;

                        // İkisi de satılmışsa daha erken satışı koru (çift satış kilidi yaklaşımı)
                        if (localMasa.isSold && onlineMasa.isSold) {
                            const localDate = new Date(localMasa.saleDetail?.saleDate || 0);
                            const onlineDate = new Date(onlineMasa.saleDetail?.saleDate || 0);
                            return localDate <= onlineDate ? localMasa : onlineMasa;
                        }
                        if (localMasa.isSold) return localMasa;
                        if (onlineMasa.isSold) return onlineMasa;

                        // Satılmadıysa local'in en güncel düzenlemelerini koru
                        return localMasa || onlineMasa;
                    });

                    return { ...(onlineCat || localCat), ...(localCat || {}), masalar: mergedMasalar };
                });
                mergedMap[key] = { ...onlineEv, categories: mergedCats };
            });

            const merged = Object.values(mergedMap).filter((ev) => !deletedIds.has(String(ev && ev.id)));
            const nextRaw = JSON.stringify(merged);
            const changed = localRaw !== nextRaw;

            if (changed) {
                window.__bpSkipAutoPush = true;
                try {
                    localStorage.setItem('EventPro_DB_Ultimate_Final', nextRaw);
                } finally {
                    window.__bpSkipAutoPush = false;
                }
            }

            return { ok: true, changed, count: merged.length };
        },

        async writeAudit(module, action, details, actor) {
            if (this.mode !== 'online' || !this.client) {
                return false;
            }
            const payload = {
                module,
                action,
                details: details || '',
                actor_name: actor?.name || actor?.username || 'anon',
                actor_username: actor?.username || 'anon',
                actor_role: actor?.role || 'guest'
            };
            const { error } = await this.client.from('audit_logs').insert(payload);
            if (error) {
                console.error('[BiletPro OnlineStore] writeAudit error:', error);
                return false;
            }
            return true;
        },

        // satis.html için: mevcut legacy event yapısını online tabloya senkronlar
        async syncLegacyEventBundle(ev) {
            if (!ev || !ev.id) return { ok: false, reason: 'invalid_event' };
            if (this.mode !== 'online' || !this.client) return { ok: false, reason: 'offline_mode' };

            const eventRow = {
                legacy_event_id: String(ev.id),
                title: ev.title || 'Etkinlik',
                company: ev.company || null,
                venue: ev.venue || null,
                city: ev.city || null,
                full_address: ev.fullAddress || null,
                event_date: this.normalizeEventDate(ev.date),
                door_time: ev.doorTime || null,
                start_time: ev.startTime || null,
                is_active: ev.isActive !== false,
                payload_json: ev
            };

            const { data: upsertedEvent, error: eventErr } = await this.client
                .from('events')
                .upsert(eventRow, { onConflict: 'legacy_event_id' })
                .select('id, legacy_event_id')
                .single();

            if (eventErr || !upsertedEvent?.id) {
                console.error('[BiletPro OnlineStore] syncLegacyEventBundle event upsert error:', eventErr);
                return { ok: false, reason: 'event_upsert_failed' };
            }

            const eventDbId = upsertedEvent.id;
            const ticketRows = [];

            (ev.categories || []).forEach((cat) => {
                (cat.masalar || []).forEach((m) => {
                    if (!m?.isSold || !m?.saleDetail?.ticketHash) return;
                    const sd = m.saleDetail || {};

                    ticketRows.push({
                        event_id: eventDbId,
                        ticket_hash: String(sd.ticketHash),
                        category_name: sd.categoryName || cat?.name || null,
                        table_no: String(m.no || ''),
                        customer_name: m.soldTo || null,
                        customer_phone: sd.phone || null,
                        sold_by_username: sd.soldBy || null,
                        people_count: parseInt(sd.people || 1, 10) || 1,
                        inside_count: parseInt(sd.insideCount || 0, 10) || 0,
                        paid: parseFloat(sd.paid || 0) || 0,
                        debt: parseFloat(sd.debt || 0) || 0,
                        status: sd.status || 'READY',
                        payload_json: {
                            masa: m,
                            saleDetail: sd
                        }
                    });
                });
            });

            if (!ticketRows.length) {
                // Çoklu kullanıcıda yanlışlıkla diğer cihaz satışlarını silmemek için
                // "boş geldi -> hepsini sil" davranışı kaldırıldı.
                return { ok: true, reason: 'event_synced_no_tickets', eventId: eventDbId };
            }

            const { error: ticketErr } = await this.client
                .from('tickets')
                .upsert(ticketRows, { onConflict: 'ticket_hash' });

            if (ticketErr) {
                console.error('[BiletPro OnlineStore] ticket upsert error:', ticketErr);
                return { ok: false, reason: 'ticket_upsert_failed' };
            }

            return { ok: true, reason: 'event_and_tickets_upserted', eventId: eventDbId, ticketCount: ticketRows.length };
        },

        // Etkinliği online'dan kalıcı sil (bağlı biletlerle birlikte)
        async deleteLegacyEventBundle(legacyEventId) {
            if (!legacyEventId) return { ok: false, reason: 'invalid_event_id' };
            if (this.mode !== 'online' || !this.client) return { ok: false, reason: 'offline_mode' };

            await this.markEventsDeleted([legacyEventId]);

            const { data: evRow, error: evFindErr } = await this.client
                .from('events')
                .select('id')
                .eq('legacy_event_id', String(legacyEventId))
                .maybeSingle();

            if (evFindErr) {
                console.error('[BiletPro OnlineStore] deleteLegacyEventBundle find error:', evFindErr);
                return { ok: false, reason: 'event_find_failed' };
            }

            if (!evRow?.id) {
                return { ok: true, reason: 'event_not_found_online' };
            }

            const eventDbId = evRow.id;

            const { error: ticketDelErr } = await this.client
                .from('tickets')
                .delete()
                .eq('event_id', eventDbId);

            if (ticketDelErr) {
                console.error('[BiletPro OnlineStore] deleteLegacyEventBundle tickets error:', ticketDelErr);
                return { ok: false, reason: 'ticket_delete_failed' };
            }

            const { error: eventDelErr } = await this.client
                .from('events')
                .delete()
                .eq('id', eventDbId);

            if (eventDelErr) {
                console.error('[BiletPro OnlineStore] deleteLegacyEventBundle event error:', eventDelErr);
                return { ok: false, reason: 'event_delete_failed' };
            }

            return { ok: true, reason: 'event_deleted_online', eventId: legacyEventId };
        },

        // Aşama 2 için: Supabase RPC (ticket_checkin_atomic)
        async atomicCheckin(ticketHash, gateUser, gateId) {
            if (this.mode !== 'online' || !this.client) {
                return { ok: false, reason: 'offline_mode' };
            }

            const { data, error } = await this.client.rpc('ticket_checkin_atomic', {
                p_ticket_hash: ticketHash,
                p_gate_user: gateUser,
                p_gate_id: gateId || 'main'
            });

            if (error) {
                console.error('[BiletPro OnlineStore] atomicCheckin error:', error);
                return { ok: false, reason: error.message || 'rpc_failed' };
            }

            return data || { ok: false, reason: 'no_data' };
        },

        async gateAction(ticketHash, action, gateUser, options = {}) {
            if (this.mode !== 'online' || !this.client) {
                return { ok: false, reason: 'offline_mode' };
            }

            const payload = {
                p_ticket_hash: ticketHash,
                p_action: action,
                p_gate_user: gateUser || 'gate-user',
                p_gate_id: options.gateId || 'main',
                p_people_delta: parseInt(options.peopleDelta || 0, 10) || 0,
                p_paid_delta: parseFloat(options.paidDelta || 0) || 0,
                p_debt_after: options.debtAfter === null || options.debtAfter === undefined
                    ? null
                    : (parseFloat(options.debtAfter) || 0)
            };

            const { data, error } = await this.client.rpc('ticket_gate_action_atomic', payload);

            if (error) {
                console.error('[BiletPro OnlineStore] gateAction error:', error);
                return { ok: false, reason: error.message || 'rpc_failed' };
            }

            return data || { ok: false, reason: 'no_data' };
        },

        // Satış oncesi masa musaitlik kontrolu: Supabase'deki en guncel payload_json'a bakar
        async checkTablesAvailableOnline(legacyEventId, tableNos) {
            if (this.mode !== 'online' || !this.client) return { ok: true, reason: 'offline' };
            if (!legacyEventId || !tableNos || tableNos.length === 0) return { ok: true, reason: 'invalid_params' };

            const { data, error } = await this.client
                .from('events')
                .select('payload_json')
                .eq('legacy_event_id', String(legacyEventId))
                .single();

            if (error || !data?.payload_json) return { ok: true, reason: 'no_online_data' };

            const onlineEv = data.payload_json;
            const alreadySold = {};

            for (const tNo of tableNos) {
                outer: for (const cat of (onlineEv.categories || [])) {
                    for (const masa of (cat.masalar || [])) {
                        if (String(masa.no) === String(tNo) && masa.isSold) {
                            alreadySold[String(tNo)] = masa.soldTo || 'Bilinmiyor';
                            break outer;
                        }
                    }
                }
            }

            const soldTables = Object.keys(alreadySold);
            if (soldTables.length > 0) {
                return { ok: false, reason: 'already_sold', tables: soldTables, soldTo: alreadySold };
            }
            return { ok: true };
        },

        // Personel verisini Supabase'e push et
        async pushStaffToOnline(staffArray) {
            if (this.mode !== 'online' || !this.client) return { ok: false, reason: 'offline_mode' };
            if (!Array.isArray(staffArray)) return { ok: false, reason: 'invalid_data' };

            const { error } = await this.client
                .from('app_config')
                .upsert({ key: 'BiletPro_Staff', value: staffArray }, { onConflict: 'key' });

            if (error) {
                console.error('[BiletPro OnlineStore] pushStaffToOnline error:', error);
                return { ok: false, reason: error.message };
            }
            return { ok: true };
        },

        // Personel verisini Supabase'den çek ve localStorage'a yaz
        async pullStaffFromOnline() {
            if (this.mode !== 'online' || !this.client) return { ok: false, reason: 'offline_mode', changed: false };

            const { data, error } = await this.client
                .from('app_config')
                .select('value')
                .eq('key', 'BiletPro_Staff')
                .single();

            if (error || !data?.value) return { ok: false, reason: 'no_staff_data', changed: false };

            const onlineStaff = data.value;
            if (!Array.isArray(onlineStaff)) return { ok: false, reason: 'invalid_staff_data', changed: false };

            // Master kullanıcıyı online veriden silme
            const currentRaw = localStorage.getItem('BiletPro_Staff') || '[]';
            const localStaff = JSON.parse(currentRaw);
            const masterLocal = localStaff.find(s => s.username && s.username.toLowerCase() === 'hakan');

            // Online listede hakan varsa local master ile güncelle (şifre koruması)
            const merged = onlineStaff.map(s => {
                if (s.username && s.username.toLowerCase() === 'hakan' && masterLocal) {
                    return { ...s, password: masterLocal.password, role: 'admin', isActive: true };
                }
                return s;
            });
            // Online'da hakan yoksa local master'ı ekle
            if (!merged.find(s => s.username && s.username.toLowerCase() === 'hakan') && masterLocal) {
                merged.push(masterLocal);
            }

            const nextRaw = JSON.stringify(merged);
            const changed = currentRaw !== nextRaw;
            if (changed) localStorage.setItem('BiletPro_Staff', nextRaw);
            return { ok: true, changed, count: merged.length };
        }
    };

    window.BiletProOnlineStore = OnlineStore;

    // Uygulama açılışında hazırla
    window.addEventListener('DOMContentLoaded', async () => {
        try {
            const res = await OnlineStore.init();
            console.info('[BiletPro OnlineStore] mode:', res.mode);
        } catch (e) {
            console.warn('[BiletPro OnlineStore] init failed, local mode');
        }
    });
})();
