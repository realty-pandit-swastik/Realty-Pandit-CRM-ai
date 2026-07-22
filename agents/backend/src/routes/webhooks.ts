

import { Router } from 'express';
import { WhatsAppService } from '../services/whatsapp';
import { processInboundMessage } from '../services/webhook_processor';
import { whatsappInboundQueue } from '../queues/index';
import logger from '../utils/logger';
import { normalizePhone, phoneVariants } from '../utils/phone';
import { cacheGet, cacheSet } from '../utils/redis';
import { forwardCallWebhookToPipecat } from '../services/pipecat_bridge';
import { identifyContact } from '../services/contact_identifier';
import { updateAgentLanguagePreference } from '../services/tool_language';
import prisma from '../db';
import { decryptFlowRequest, encryptFlowResponse } from '../services/whatsapp_flows';
import { upsertCatalogProduct } from '../services/catalog_sync';
import { captureRouteError } from '../utils/capture';

// Minimal date helpers (no dayjs dependency)
function addDays(d: Date, n: number): Date {
    const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtShort(d: Date): string { return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`; }
function toDateStr(d: Date): string { return d.toISOString().slice(0, 10); }
function parseVisitDateTime(dateStr: string, timeStr: string): Date {
    // dateStr: "2026-04-22", timeStr: "10:00 AM"
    const [y, m, day] = dateStr.split('-').map(Number);
    const [timePart, ampm] = timeStr.split(' ');
    let [h, min] = timePart.split(':').map(Number);
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return new Date(y, m - 1, day, h, min || 0);
}
function fmtVisitConfirm(d: Date, timeStr: string): string {
    return `${fmtShort(d)} ko ${timeStr} pe`;
}

const router = Router();
const whatsappService = new WhatsAppService();

// ─── Message ID Dedup: Redis-based (survives restarts, works across PM2 cluster) ─
const processedMessageIdsFallback = new Set<string>();
const MESSAGE_ID_TTL = 120; // 2 minutes (Redis seconds)

async function isMessageProcessed(messageId: string): Promise<boolean> {
    const key = `msg_dedup:${messageId}`;
    const cached = await cacheGet(key);
    if (cached) return true;
    if (processedMessageIdsFallback.has(messageId)) {
        logger.warn('[Webhook] Using in-memory dedup fallback — Redis may be unavailable');
        return true;
    }
    return false;
}

async function markMessageProcessed(messageId: string): Promise<void> {
    const key = `msg_dedup:${messageId}`;
    await cacheSet(key, '1', MESSAGE_ID_TTL);
    processedMessageIdsFallback.add(messageId);
    setTimeout(() => processedMessageIdsFallback.delete(messageId), MESSAGE_ID_TTL * 1000);
}

// ─── WhatsApp Call Event Parser ──────────────────────────────────────────────
// WhatsApp sends event="connect" with an SDP offer when a user initiates a call.
// event="terminate" fires when either party ends the call.
function extractCallEvent(body: any): {
    type: 'call_connect' | 'call_terminate' | null;
    call_id: string;
    caller: string;
    sdp_offer: string;
} {
    try {
        const callObj = body?.entry?.[0]?.changes?.[0]?.value?.calls?.[0];
        if (!callObj) return { type: null, call_id: '', caller: '', sdp_offer: '' };

        const call_id = callObj.id || '';
        const caller = normalizePhone(callObj.from || '');
        const event = (callObj.event || '').toLowerCase();
        const sdp_offer = callObj.session?.sdp || '';

        if (event === 'connect') {
            return { type: 'call_connect', call_id, caller, sdp_offer };
        }
        if (event === 'terminate') {
            return { type: 'call_terminate', call_id, caller, sdp_offer: '' };
        }
        return { type: null, call_id, caller, sdp_offer: '' };
    } catch {
        return { type: null, call_id: '', caller: '', sdp_offer: '' };
    }
}

// ─── WhatsApp Webhook (Async Processing via BullMQ) ─────────────────────────
// Responds 200 IMMEDIATELY so Meta never times out (5-second deadline).
// Messages are queued in BullMQ and processed asynchronously by the worker.
// Fallback: if BullMQ/Redis is unavailable, processes synchronously.

router.post('/whatsapp', async (req, res) => {
    // Respond 200 IMMEDIATELY — Meta must not wait for message processing
    res.sendStatus(200);

    // Diagnostic: log every webhook hit with its field type — remove after debugging
    const changeValue = req.body?.entry?.[0]?.changes?.[0]?.value;
    const fieldType = req.body?.entry?.[0]?.changes?.[0]?.field || 'unknown';
    logger.info(`[Webhook] HIT — field: ${fieldType}, has_calls: ${!!changeValue?.calls}, has_messages: ${!!changeValue?.messages}`);
    if (changeValue?.calls) {
        logger.info('[Webhook] CALL RAW:', JSON.stringify(req.body, null, 2));
    }

    // Delivery-status callbacks (sent / delivered / read / failed). Meta sends one per
    // outbound message. These were being discarded entirely, so a message Meta ACCEPTED
    // but never DELIVERED looked identical to a success: the send logged fine, the
    // Interaction row was written, and the customer got nothing. Log them so a delivery
    // failure is visible instead of silent.
    if (changeValue?.statuses) {
        for (const s of changeValue.statuses) {
            if (s.status === 'failed') {
                logger.error(`[WA-Delivery] FAILED → ${s.recipient_id}: ${JSON.stringify(s.errors || [])}`);
            } else {
                logger.info(`[WA-Delivery] ${s.status} → ${s.recipient_id}`);
            }
        }
    }

    // ─── WhatsApp Calling API: forward raw webhook to Pipecat ────────────────
    // Pipecat's WhatsAppClient owns the full call flow: HMAC verify, WebRTC
    // setup, pre_accept + accept via Graph API, media.  We just proxy the raw
    // bytes + Meta signature header so the signature check still validates.
    const callEvent = extractCallEvent(req.body);
    if (callEvent.type === 'call_connect' || callEvent.type === 'call_terminate') {
        logger.info(`[Webhook] ${callEvent.type} for call ${callEvent.call_id}${callEvent.caller ? ` from ${callEvent.caller}` : ''} — forwarding to Pipecat`);
        const rawBody: Buffer = (req as any).rawBody;
        const signature = req.header('x-hub-signature-256');
        forwardCallWebhookToPipecat(rawBody, signature)
            .catch(err => logger.error('[Webhook] Forward to Pipecat failed:', err));
        return;
    }

    try {
        const messages = whatsappService.parseWebhook(req.body);

        for (const msg of messages) {
            // Message ID deduplication (Redis + in-memory fallback)
            const messageId = msg.id;
            if (messageId && await isMessageProcessed(messageId)) {
                logger.info(`[Webhook] Duplicate message ${messageId}, skipping`);
                continue;
            }
            if (messageId) {
                await markMessageProcessed(messageId);
            }

            const from = normalizePhone(msg.from);

            // Capture CTWA ad-click id (ctwa_clid) for Conversions API lead
            // attribution. Best-effort + non-blocking — never affects message
            // processing. 7-day TTL = Meta's CTWA attribution window.
            const ctwaClid = (msg as any).referral?.ctwa_clid;
            if (ctwaClid) {
                cacheSet(`ctwa:${from}`, String(ctwaClid), 7 * 24 * 3600).catch(() => { /* non-fatal */ });
                logger.info(`[Webhook] CTWA ad-click captured for ${from}`);
            }

            // Extract text from ALL message types: plain text, interactive reply, button
            const text = msg.text?.body
                || msg.interactive?.button_reply?.title
                || msg.interactive?.list_reply?.title
                || msg.button?.text
                || '';

            // Extract location data if user shared a location pin
            const locationData = msg.location ? {
                latitude: msg.location.latitude,
                longitude: msg.location.longitude,
                name: msg.location.name || '',
                address: msg.location.address || '',
            } : undefined;

            // Skip empty messages that carry no actionable content
            // (reactions, stickers, contacts, unsupported types)
            // Allow: text, interactive replies, images, documents, videos, location pins
            const hasContent = text.length > 0
                || msg.type === 'image'
                || msg.type === 'document'
                || msg.type === 'video'
                || msg.type === 'location';
            if (!hasContent) {
                logger.info(`[Webhook] Skipping non-actionable msg from ${from} (type: ${msg.type})`);
                continue;
            }

            // For location pins, create a text representation for the AI
            const effectiveText = locationData
                ? `[Location shared: ${locationData.name || locationData.address || `${locationData.latitude},${locationData.longitude}`}]`
                : text;

            const jobData = { from, text: effectiveText, rawMessage: msg, locationData };

            try {
                // Queue for async processing (BullMQ → worker)
                await whatsappInboundQueue.add('process-message', jobData, {
                    jobId: messageId || undefined, // Natural BullMQ dedup
                });
                logger.info(`[Webhook] Queued message ${messageId} from ${from}`);
            } catch (queueErr) {
                // BullMQ/Redis unavailable — process synchronously as fallback
                logger.warn(`[Webhook] Queue unavailable, processing synchronously: ${(queueErr as Error).message}`);
                processInboundMessage(jobData).catch((err: unknown) =>
                    logger.error('[Webhook] Sync fallback error:', err)
                );
            }
        }
    } catch (error) {
        captureRouteError(error, req, { route: 'webhook/whatsapp', source: 'parse_or_queue' });
    }
});

// ─── WhatsApp Verification (GET) ────────────────────────────────────────────
router.get('/whatsapp', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    logger.info('[WhatsApp] Verification attempt', { mode, hasToken: !!token, hasChallenge: !!challenge });

    if (mode === 'subscribe' && token) {
        if (token === process.env.WHATSAPP_VERIFY_TOKEN) {
            logger.info('[WhatsApp] Webhook verified successfully');
            return res.status(200).type('text/plain').send(String(challenge));
        } else {
            logger.warn('[WhatsApp] Invalid verify token');
            return res.sendStatus(403);
        }
    }

    return res.sendStatus(400);
});

// ─── Voice Webhook (Vapi) ───────────────────────────────────────────────────
import { VoiceService } from '../services/voice';

const voiceService = new VoiceService();

router.post('/voice', async (req, res) => {
    try {
        logger.info('[Voice] Incoming call event type:', req.body.message?.type);
        await voiceService.handleWebhook(req.body);
        res.sendStatus(200);
    } catch (err) {
        captureRouteError(err, req, { route: 'webhook/voice' });
        res.sendStatus(500);
    }
});

// ─── Internal: Pipecat → Node.js caller lookup ───────────────────────────────
// Called by Pipecat at call-connect time to identify who is calling before
// Panditji speaks. Returns name, role, contact type, and recent lead history.
// NOT exposed publicly — only reachable from localhost (Nginx blocks external).
router.get('/internal/caller-lookup', async (req, res) => {
    const phone = req.query.phone as string;
    if (!phone) return res.status(400).json({ error: 'phone required' });

    try {
        const variants = phoneVariants(phone);

        const [identified, contact] = await Promise.all([
            identifyContact(phone),
            prisma.contact.findFirst({
                where: { phone_number: { in: variants } },
                select: {
                    name: true,
                    intent: true,
                    property_type: true,
                    budget_min: true,
                    budget_max: true,
                    preferred_location: true,
                    contact_type: true,
                    leads: {
                        orderBy: { created_at: 'desc' },
                        take: 3,
                        select: {
                            intent: true,
                            // Phase 5: legacy demand_main_category / demand_type_slug dropped.
                            // Surface canonical fields so the caller-lookup payload still
                            // tells the agent what the buyer wants.
                            demand_taxonomy_node_id: true,
                            demand_schema_values: true,
                            budget_min: true,
                            budget_max: true,
                            created_at: true,
                        },
                    },
                },
            }),
        ]);

        logger.info(`[Internal] caller-lookup ${phone} → identified: ${identified?.contact_type ?? 'UNKNOWN'}, name: ${identified?.name ?? contact?.name ?? 'unknown'}`);
        res.json({ identified, contact });
    } catch (err) {
        captureRouteError(err, req, { route: 'webhook/internal/caller-lookup' });
        res.status(500).json({ error: 'lookup failed' });
    }
});

// ─── Internal: Pipecat → Node.js call-ended callback ────────────────────────
// Called by Python Pipecat service to save transcript after call finishes.
// NOT exposed publicly — only reachable from localhost (Nginx blocks external).
router.post('/internal/call-ended', async (req, res) => {
    res.sendStatus(200);

    try {
        const { call_id, caller_number, transcript, started_at, duration, source } = req.body;
        if (source !== 'pipecat' || !caller_number) return;

        logger.info(`[Internal] Saving Pipecat call record for ${caller_number}`);
        await voiceService.savePipecatCallRecord({ call_id, caller_number, transcript, started_at, duration });

        // Dynamic language learning for internal team members
        await updateAgentLanguagePreference(caller_number, transcript ?? '');
    } catch (err) {
        captureRouteError(err, req, { route: 'webhook/internal/call-ended' });
    }
});

// ─── WhatsApp Flows Data Endpoint ────────────────────────────────────────────
// Meta calls this to get dynamic screen content and to complete flows.
// GET = health check. POST = encrypted data_exchange or INIT action.
router.all('/flows/data', async (req, res) => {
    // Health check — Meta sends GET with no body to verify the endpoint is live
    if (req.method === 'GET' || !req.body?.encrypted_flow_data) {
        return res.json({ data: { status: 'active' } });
    }

    const privateKey = (process.env.FLOW_PRIVATE_KEY ?? '').replace(/\|/g, '\n');
    if (!privateKey) {
        logger.warn('[FlowsEndpoint] FLOW_PRIVATE_KEY not set — returning health only');
        return res.json({ data: { status: 'active' } });
    }

    try {
        const { encrypted_flow_data, encrypted_aes_key, initial_vector } = req.body;
        const { screen, data, action, aesKey, iv } = decryptFlowRequest(
            encrypted_flow_data, encrypted_aes_key, initial_vector,
        );

        let responseData: any;

        if (screen === 'SEARCH_SCREEN' && action === 'INIT') {
            const [cityRows, typeRows] = await Promise.all([
                prisma.inventory.findMany({ where: { status: 'active' }, select: { city: true }, distinct: ['city'] }),
                prisma.inventory.findMany({ where: { status: 'active' }, select: { type: true }, distinct: ['type'] }),
            ]);
            responseData = {
                screen: 'SEARCH_SCREEN',
                data: {
                    cities: cityRows.map((r: any) => ({ id: r.city, title: r.city })).filter((r: any) => r.id),
                    property_types: typeRows.map((r: any) => ({ id: r.type, title: r.type })).filter((r: any) => r.id),
                },
            };

        } else if (screen === 'SEARCH_SCREEN' && action === 'data_exchange') {
            const { city, intent, category, property_type, bhk, phone } = data;
            const where: any = { status: 'active' };
            if (city) where.city = { contains: city, mode: 'insensitive' };
            if (intent) {
                const intentLower = String(intent).toLowerCase();
                where.intent = intentLower === 'buy' ? 'sell' : { in: ['rent', 'rent_lease', 'lease'] };
            }
            if (category) where.category = { contains: category, mode: 'insensitive' };
            if (property_type) where.type = { contains: property_type, mode: 'insensitive' };

            const properties = await prisma.inventory.findMany({ where, take: 20, orderBy: { created_at: 'desc' } });
            const bhkFilter = bhk ? Number(bhk) : null;
            const filtered = bhkFilter
                ? properties.filter((p: any) => (p.specs as any)?.bedrooms === bhkFilter)
                : properties;

            if (phone && filtered.length > 0) {
                await Promise.all(filtered.map((p: any) => upsertCatalogProduct(p).catch(() => null)));
                const ids = filtered.map((p: any) => String(p.id));
                const wa = whatsappService;
                try {
                    await wa.sendMultiProductMessage(phone, 'Matching Properties',
                        `${filtered.length} properties match your search.`, 'Realty Pandit',
                        [{ title: 'Results', productRetailerIds: ids }]);
                } catch {
                    // Fallback text if catalog not indexed yet
                    const lines = filtered.slice(0, 8).map((p: any, i: number) =>
                        `${i + 1}. ${p.apartment_name || p.type || 'Property'} in ${p.city || ''}\nhttps://www.realtypandit.in/properties/${p.id}`);
                    await wa.sendText(phone, `*${filtered.length} Properties Found:*\n\n${lines.join('\n\n')}`).catch(() => null);
                }
            }

            responseData = {
                screen: 'RESULT_SCREEN',
                data: {
                    result_message: filtered.length > 0
                        ? `${filtered.length} properties mil gayi! Check karo apna WhatsApp.`
                        : 'Koi property nahi mili. Filters change karke try karein.',
                },
            };

        } else if (screen === 'DATE_SCREEN' && action === 'INIT') {
            const today = new Date();
            const next7 = Array.from({ length: 7 }, (_, i) => {
                const d = addDays(today, i + 1);
                return { id: toDateStr(d), title: fmtShort(d) };
            });
            responseData = { screen: 'DATE_SCREEN', data: { ...data, available_dates: next7 } };

        } else if (screen === 'DATE_SCREEN' && action === 'data_exchange') {
            const slots = ['10:00 AM', '11:00 AM', '12:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM']
                .map(t => ({ id: t, title: t }));
            responseData = { screen: 'TIME_SCREEN', data: { ...data, available_slots: slots } };

        } else if (screen === 'TIME_SCREEN' && action === 'data_exchange') {
            const { visit_date, visit_time, property_id, property_name } = data;
            const phone = data.phone ?? req.body?.from;
            const scheduledAt = parseVisitDateTime(visit_date, visit_time);
            const contact = phone
                ? await prisma.contact.findFirst({ where: { phone_number: phone } })
                : null;

            await prisma.appointment.create({
                data: {
                    scheduled_at: scheduledAt,
                    type: 'SITE_VISIT',
                    status: 'PENDING',
                    notes: `WhatsApp Flow booking. Property: ${property_name} (ID: ${property_id})`,
                    contact_id: contact?.id ?? null,
                    inventory_id: property_id ? String(property_id) : null,
                    source: 'WHATSAPP_FLOW',
                } as any,
            });

            // Notify assigned agent via existing template
            const inventory = property_id
                ? await prisma.inventory.findUnique({
                    where: { id: String(property_id) },
                    include: { assigned_agent: true },
                })
                : null;
            if ((inventory as any)?.assigned_agent?.phone) {
                const wa = whatsappService;
                await wa.sendTemplate(
                    (inventory as any).assigned_agent.phone,
                    'rp_visit_agent_notify_v3',
                    {
                        contact_name: contact?.name ?? phone ?? 'Customer',
                        property_name: property_name ?? `Property #${property_id}`,
                        scheduled_at: dayjs(scheduledAt).format('ddd, MMM D [at] h:mm A'),
                    },
                ).catch((e: Error) => logger.warn('[FlowsEndpoint] Agent notify failed:', e.message));
            }

            responseData = {
                screen: 'CONFIRM_SCREEN',
                data: {
                    confirmation_message: `Visit book ho gaya ${fmtVisitConfirm(scheduledAt, visit_time)}. Hamari team jald contact karegi!`,
                },
            };

        } else {
            // Pass-through for unknown screens
            responseData = { screen, data };
        }

        return res.json({ encrypted_response: encryptFlowResponse(responseData, aesKey, iv) });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'webhook/flows' });
        return res.status(500).json({ error: 'internal error' });
    }
});

export default router;
