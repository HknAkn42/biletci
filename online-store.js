/*
 * BiletPro Online Store Bridge v1
 * - Varsayılan: localStorage
 * - Online: Supabase (config varsa)
 */
(function () {
    const ONLINE_CACHE_KEY = 'BiletPro_OnlineRuntime';

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

        normalizeEventDate(raw) {
            if (!raw) return null;
            const d = new Date(raw);
            if (Number.isNaN(d.getTime())) return null;
            return d.toISOString().slice(0, 10);
        },

        async init() {
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
                this.client = window.supabase.createClient(onlineCfg.supabaseUrl, onlineCfg.supabaseAnonKey, {
                    auth: { persistSession: false }
                });
                this.mode = 'online';
                localStorage.setItem(ONLINE_CACHE_KEY, JSON.stringify({ mode: this.mode, lastInit: new Date().toISOString() }));
                return { ok: true, mode: this.mode };
            } catch (err) {
                console.error('[BiletPro OnlineStore] init error:', err);
                this.mode = 'local';
                return { ok: false, mode: this.mode, reason: 'client_create_failed' };
            }
        },

        getMode() {
            return this.mode;
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
            const localEvents = [];

            rows.forEach((r) => {
                const p = r && r.payload_json;
                if (p && typeof p === 'object' && p.id) {
                    localEvents.push(p);
                    return;
                }
                if (r && r.legacy_event_id) {
                    localEvents.push({
                        id: String(r.legacy_event_id),
                        title: 'Etkinlik',
                        categories: [],
                        isActive: true
                    });
                }
            });

            const currentRaw = localStorage.getItem('EventPro_DB_Ultimate_Final') || '[]';
            const nextRaw = JSON.stringify(localEvents);
            const changed = currentRaw !== nextRaw;

            if (changed) {
                localStorage.setItem('EventPro_DB_Ultimate_Final', nextRaw);
            }

            return { ok: true, changed, count: localEvents.length };
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
                const { error: clearErr } = await this.client
                    .from('tickets')
                    .delete()
                    .eq('event_id', eventDbId);
                if (clearErr) {
                    console.warn('[BiletPro OnlineStore] no tickets but delete old tickets failed:', clearErr);
                }
                return { ok: true, reason: 'event_synced_no_tickets', eventId: eventDbId };
            }

            const hashesNow = ticketRows.map((t) => t.ticket_hash);

            const { data: existingTickets, error: existingErr } = await this.client
                .from('tickets')
                .select('ticket_hash')
                .eq('event_id', eventDbId);

            if (existingErr) {
                console.warn('[BiletPro OnlineStore] existing ticket fetch failed:', existingErr);
            }

            const existingHashes = (existingTickets || []).map((r) => r.ticket_hash);
            const staleHashes = existingHashes.filter((h) => !hashesNow.includes(h));

            if (staleHashes.length) {
                const { error: staleDeleteErr } = await this.client
                    .from('tickets')
                    .delete()
                    .in('ticket_hash', staleHashes);
                if (staleDeleteErr) {
                    console.warn('[BiletPro OnlineStore] stale ticket delete failed:', staleDeleteErr);
                }
            }

            const { error: ticketErr } = await this.client
                .from('tickets')
                .upsert(ticketRows, { onConflict: 'ticket_hash' });

            if (ticketErr) {
                console.error('[BiletPro OnlineStore] ticket upsert error:', ticketErr);
                return { ok: false, reason: 'ticket_upsert_failed' };
            }

            return { ok: true, reason: 'event_and_tickets_synced', eventId: eventDbId, ticketCount: ticketRows.length };
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
