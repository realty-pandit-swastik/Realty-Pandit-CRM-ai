/**
 * Pipeline Cron Jobs — Stage-specific scheduled triggers per KRA specs (DEC-003).
 *
 * 1. NEGOTIATION 48hr nudge — daily 9:10 AM IST (03:40 UTC): no meeting booked yet
 * 2. NEGOTIATION 14-day inactivity → ON_HOLD — daily 9:15 AM IST (03:45 UTC)
 * 3. Cold lead nudge (QUALIFIED) — daily 10:20 IST (04:50 UTC)
 * 4. Visit reminders — every 30 min
 */

import cron from 'node-cron';
import * as SentrySDK from '@sentry/node';
import prisma from '../db';
import logger from '../utils/logger';

function captureCronError(name: string, err: unknown): void {
    SentrySDK.captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { worker: 'pipeline_cron', cron: name },
    });
}
import { WhatsAppService } from './whatsapp';
import { notifyDealEvent } from './deal_notifications';
import { transitionTransaction } from './transaction_state_machine';

const whatsapp = new WhatsAppService();

const EVT_NEGOTIATION_NUDGE = 'pipeline_negotiation_nudge';

// Returns true if a team member acted on this deal within the given window.
// Used to suppress AI automation when a human has already intervened.
function teamActedRecently(deal: { last_team_action_at: Date | null }, windowMs: number): boolean {
    if (!deal.last_team_action_at) return false;
    return Date.now() - deal.last_team_action_at.getTime() < windowMs;
}

export function initPipelineCrons(): void {
    cron.schedule('40 3 * * *', async () => {
        try { await runNegotiationNudge(); }
        catch (err) { logger.error('[PipelineCron] NEGOTIATION nudge error:', err); captureCronError('negotiation_nudge', err); }
    });

    cron.schedule('45 3 * * *', async () => {
        try { await runNegotiationInactivitySweep(); }
        catch (err) { logger.error('[PipelineCron] NEGOTIATION inactivity sweep error:', err); captureCronError('negotiation_inactivity', err); }
    });

    // Stage 2 KRA cold-lead cadence — runs daily 10:20 IST (04:50 UTC); per-deal logic decides
    // whether to fire today based on type (RENT: weekends Thu-Sun; BUY: weekly→monthly).
    cron.schedule('50 4 * * *', async () => {
        try { await runColdLeadNudge(); }
        catch (err) { logger.error('[PipelineCron] Cold lead nudge error:', err); captureCronError('cold_lead_nudge', err); }
    });

    // Stage 4 KRA visit reminders — every 30 min, fires 24hr-before + 2hr-before reminders.
    cron.schedule('*/30 * * * *', async () => {
        try { await runVisitReminders(); }
        catch (err) { logger.error('[PipelineCron] Visit reminder error:', err); captureCronError('visit_reminders', err); }
    });

    // Stage 4 KRA: daily 8AM IST consolidated visit schedule for each lead manager.
    // 8 AM IST = 02:30 UTC.
    cron.schedule('30 2 * * *', async () => {
        try { await runManagerDailySchedule(); }
        catch (err) { logger.error('[PipelineCron] Manager daily schedule error:', err); captureCronError('manager_daily_schedule', err); }
    });

    // Stage 4 KRA: 24hr-before briefing to lead manager per visit. Runs every 30 min,
    // detects appointments 23.5-24.5hr out and sends a per-deal briefing.
    cron.schedule('15,45 * * * *', async () => {
        try { await runManager24hrBriefing(); }
        catch (err) { logger.error('[PipelineCron] Manager 24hr briefing error:', err); captureCronError('manager_24hr_briefing', err); }
    });

    logger.info('[PipelineCron] Pipeline crons started (appt 30min, neg-nudge+inactivity 9AM IST, cold 10:20 IST, visit reminders 30min, mgr 8AM schedule, mgr 24hr briefing)');
}

// ─── 1. NEGOTIATION 48hr nudge ───────────────────────────────────────────────
//
// Deals in NEGOTIATION for >48hr without any Appointment recorded.
// Send `rp_negotiation_nudge` to coordinator. Once per deal — dedup via Interaction.

async function runNegotiationNudge(): Promise<void> {
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const candidates = await prisma.transaction.findMany({
        where: {
            status: 'NEGOTIATION',
            updated_at: { lt: fortyEightHoursAgo },
            ai_paused: false,
        },
        include: {
            demand_contact: { select: { name: true } },
            coordinator: { select: { phone: true } },
            appointments: { where: { created_at: { gte: fortyEightHoursAgo } }, select: { id: true } },
        },
    });

    for (const deal of candidates) {
        if (!deal.coordinator?.phone) continue;
        if (deal.appointments.length > 0) continue; // meeting was booked, skip
        // Skip if team logged an update in the last 48 hours (meeting/call/note)
        if (teamActedRecently(deal, 48 * 60 * 60 * 1000)) continue;

        const alreadyNudged = await prisma.interaction.findFirst({
            where: {
                event_type: EVT_NEGOTIATION_NUDGE,
                metadata: { path: ['deal_id'], equals: deal.id },
            },
        });
        if (alreadyNudged) continue;

        const customerName = deal.demand_contact?.name || 'Customer';
        await whatsapp.sendTemplate(deal.coordinator.phone, 'rp_negotiation_nudge', {
            customer_name: customerName,
        });
        await prisma.interaction.create({
            data: {
                tenant_id: deal.tenant_id,
                phone_number: deal.coordinator.phone,
                channel: 'system',
                direction: 'outbound',
                event_type: EVT_NEGOTIATION_NUDGE,
                content: '48hr negotiation nudge to coordinator',
                metadata: { deal_id: deal.id },
            },
        });
        logger.info(`[PipelineCron] Negotiation 48hr nudge sent for deal ${deal.id}`);
    }
}

// ─── 3. NEGOTIATION 14-day inactivity → ON_HOLD ─────────────────────────────
//
// Deals in NEGOTIATION with no Interaction in last 14 days → move to ON_HOLD.
// The status_changed wiring then fires `rp_deal_onhold` to coordinator (per
// updated `deal_notifications.ts`).

async function runNegotiationInactivitySweep(): Promise<void> {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const candidates = await prisma.transaction.findMany({
        where: {
            status: 'NEGOTIATION',
            updated_at: { lt: fourteenDaysAgo },
            ai_paused: false,
        },
        select: { id: true, tenant_id: true, demand_contact_id: true, last_team_action_at: true },
    });

    for (const deal of candidates) {
        // If team acted within 14 days, reset the clock (use last_team_action_at as activity baseline)
        if (deal.last_team_action_at && deal.last_team_action_at.getTime() > fourteenDaysAgo.getTime()) continue;

        const recentInteraction = await prisma.interaction.findFirst({
            where: {
                phone_number: deal.demand_contact_id,
                tenant_id: deal.tenant_id,
                created_at: { gte: fourteenDaysAgo },
                event_type: { not: 'deal_notification' }, // ignore our own outbound system pings
            },
            select: { id: true },
        });
        if (recentInteraction) continue;

        try {
            await transitionTransaction(
                deal.id,
                'ON_HOLD' as any,
                'system-cron',
                'system',
                { reason: '14 days inactivity in NEGOTIATION' },
            );
            await notifyDealEvent({
                dealId: deal.id,
                event: 'status_changed',
                newStatus: 'ON_HOLD',
                reason: '14 din se koi progress nahi',
            });
            logger.info(`[PipelineCron] Moved deal ${deal.id} to ON_HOLD (14d inactivity)`);
        } catch (err) {
            logger.error(`[PipelineCron] Failed to move deal ${deal.id} to ON_HOLD:`, err);
        }
    }
}

// ─── 4. Stage 2 cold-lead nudge ──────────────────────────────────────────────
//
// QUALIFIED deals that haven't engaged in N days get a soft re-engagement message.
// Cadence per Stage 2 KRA:
//   - RENT: only on weekends (Thu/Fri/Sat/Sun) once per week
//   - BUY:  weekly for first 4 weeks, then monthly
// Dedup: track last nudge in Interaction(event_type='pipeline_cold_nudge').

async function runColdLeadNudge(): Promise<void> {
    const dayOfWeek = new Date().getDay(); // 0=Sun..6=Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 4 || dayOfWeek === 5 || dayOfWeek === 6;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const candidates = await prisma.transaction.findMany({
        where: {
            status: 'QUALIFIED',
            updated_at: { lt: sevenDaysAgo },
            ai_paused: false,
        },
        include: {
            demand_contact: { select: { phone_number: true, name: true } },
        },
    });

    for (const deal of candidates) {
        if (!deal.demand_contact?.phone_number) continue;
        // Skip if team shared a property or acted in the last 7 days
        if (teamActedRecently(deal, 7 * 24 * 60 * 60 * 1000)) continue;

        const isRent = deal.type === 'RENT';
        if (isRent && !isWeekend) continue; // RENT nudges only on weekends

        // Find last nudge — enforce cadence
        const lastNudge = await prisma.interaction.findFirst({
            where: {
                event_type: 'pipeline_cold_nudge',
                metadata: { path: ['deal_id'], equals: deal.id },
            },
            orderBy: { created_at: 'desc' },
            select: { created_at: true, metadata: true },
        });

        const now = Date.now();
        let minGapMs: number;
        if (isRent) {
            minGapMs = 7 * 24 * 60 * 60 * 1000; // weekly
        } else {
            // BUY: weekly for first 4 nudges, then monthly
            const previousCount = await prisma.interaction.count({
                where: {
                    event_type: 'pipeline_cold_nudge',
                    metadata: { path: ['deal_id'], equals: deal.id },
                },
            });
            minGapMs = previousCount < 4
                ? 7 * 24 * 60 * 60 * 1000        // weekly first 4
                : 30 * 24 * 60 * 60 * 1000;      // monthly thereafter
        }
        if (lastNudge && now - lastNudge.created_at.getTime() < minGapMs) continue;

        const customerName = deal.demand_contact.name || 'Customer';
        const tplName = isRent ? 'rp_cold_rent_nudge' : 'rp_cold_buy_nudge';
        const params: Record<string, string> = isRent
            ? { name: customerName }
            : (() => {
                // Phase 5: legacy demand_property_type / demand_type_slug dropped.
                // Pull a humanized label from canonical demand_schema_values.
                const sv = ((deal as any).demand_schema_values ?? {}) as Record<string, any>;
                const propertyType = (typeof sv.property_type === 'string' && sv.property_type)
                    || (typeof sv.type === 'string' && sv.type)
                    || 'property';
                return {
                    name: customerName,
                    location: deal.demand_location || 'your area',
                    property_type: propertyType,
                };
            })();
        try {
            await whatsapp.sendTemplate(deal.demand_contact.phone_number, tplName, params);
            await prisma.interaction.create({
                data: {
                    tenant_id: deal.tenant_id,
                    phone_number: deal.demand_contact.phone_number,
                    channel: 'whatsapp',
                    direction: 'outbound',
                    event_type: 'pipeline_cold_nudge',
                    content: `Cold-lead nudge (${tplName})`,
                    metadata: { deal_id: deal.id, template: tplName, intent: deal.type },
                },
            });
            logger.info(`[PipelineCron] Cold nudge sent to ${deal.demand_contact.phone_number} (${tplName})`);
        } catch (err) {
            logger.warn(`[PipelineCron] Cold nudge failed for deal ${deal.id}:`, err);
        }
    }
}

// ─── 5. Stage 4 visit reminders — 24hr + 2hr before appointment ──────────────
//
// Runs every 30 min. Finds VISIT_SCHEDULED deals with linked Appointments
// firing in (~24hr ± 30min) and (~2hr ± 30min) windows; sends reminder + opens
// fresh Meta session via reply button. Dedup via Interaction event_type.

async function runVisitReminders(): Promise<void> {
    const now = Date.now();
    const window24Start = new Date(now + 23.5 * 60 * 60 * 1000);
    const window24End = new Date(now + 24.5 * 60 * 60 * 1000);
    const window2Start = new Date(now + 1.5 * 60 * 60 * 1000);
    const window2End = new Date(now + 2.5 * 60 * 60 * 1000);

    const fireReminder = async (windowStart: Date, windowEnd: Date, kind: '24hr' | '2hr') => {
        const eventKey = `pipeline_visit_reminder_${kind}`;
        const appts = await prisma.appointment.findMany({
            where: {
                scheduled_at: { gte: windowStart, lte: windowEnd },
                status: { in: ['scheduled', 'confirmed'] },
                transaction_id: { not: null },
            },
            include: {
                contact: { select: { phone_number: true, name: true } },
                property: { select: { type: true, location: true, latitude: true, longitude: true } },
                transaction: { select: { id: true, status: true, tenant_id: true, ai_paused: true, last_team_action_at: true } },
            },
        });

        for (const appt of appts) {
            if (!appt.transaction || appt.transaction.status !== 'VISIT_SCHEDULED') continue;
            if (!appt.contact?.phone_number) continue;
            if (appt.transaction.ai_paused) continue;
            // Skip if team already called to remind in the last 2 hours
            if (kind === '2hr' && teamActedRecently(appt.transaction, 2 * 60 * 60 * 1000)) continue;

            const already = await prisma.interaction.findFirst({
                where: {
                    event_type: eventKey,
                    metadata: { path: ['appointment_id'], equals: appt.id },
                },
                select: { id: true },
            });
            if (already) continue;

            const datetime = appt.scheduled_at.toLocaleString('en-IN', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
            });
            const property = `${appt.property?.type || 'Property'}, ${appt.property?.location || 'Location TBD'}`;
            const mapsLink = (appt.property?.latitude && appt.property?.longitude)
                ? `https://maps.google.com/?q=${appt.property.latitude},${appt.property.longitude}`
                : (appt.property?.location || '');

            try {
                // Templates pending Meta approval — degrade to plaintext if template send fails.
                if (kind === '24hr') {
                    const fallback = `⏰ Kal aapka visit hai!\n📅 ${datetime}\n🏠 ${property}\n\nReply "Confirmed" if you can attend.`;
                    await whatsapp.sendTemplateOrText(
                        appt.contact.phone_number,
                        'rp_visit_reminder_24hr',
                        { datetime, property },
                        fallback,
                    );
                } else {
                    const fallback = `🔔 2 ghante mein visit!\n📅 ${datetime}\n🏠 ${property}\n📍 ${mapsLink}\n\nTime pe pahunchen!`;
                    await whatsapp.sendTemplateOrText(
                        appt.contact.phone_number,
                        'rp_visit_reminder_2hr',
                        { datetime, property, maps_link: mapsLink },
                        fallback,
                    );
                }
                await prisma.interaction.create({
                    data: {
                        tenant_id: appt.transaction.tenant_id,
                        phone_number: appt.contact.phone_number,
                        channel: 'whatsapp',
                        direction: 'outbound',
                        event_type: eventKey,
                        content: `Visit reminder ${kind} for ${property}`,
                        metadata: { appointment_id: appt.id, deal_id: appt.transaction.id, kind },
                    },
                });
                logger.info(`[PipelineCron] Visit reminder ${kind} sent for appt ${appt.id}`);
            } catch (err) {
                logger.warn(`[PipelineCron] Visit reminder ${kind} failed for appt ${appt.id}:`, err);
            }
        }
    };

    await fireReminder(window24Start, window24End, '24hr');
    await fireReminder(window2Start, window2End, '2hr');
}

// ─── 6. Stage 4: Lead-manager 8AM daily visit schedule ───────────────────────
//
// At 8 AM IST every day, send each agent a consolidated WhatsApp listing all
// their VISIT_SCHEDULED appointments for the day. Uses rp_visit_daily_schedule
// (already in registry).

async function runManagerDailySchedule(): Promise<void> {
    const todayIst = new Date();
    // Build a 24h window in IST (start of today IST = previous-day 18:30 UTC).
    const istOffsetMin = 5 * 60 + 30;
    const startIstMs = new Date(todayIst.getTime() + istOffsetMin * 60 * 1000);
    startIstMs.setUTCHours(0, 0, 0, 0);
    const startUtc = new Date(startIstMs.getTime() - istOffsetMin * 60 * 1000);
    const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);

    const appts = await prisma.appointment.findMany({
        where: {
            scheduled_at: { gte: startUtc, lt: endUtc },
            status: { in: ['scheduled', 'confirmed'] },
            assigned_to_agent_id: { not: null },
        },
        include: {
            contact: { select: { name: true } },
            property: { select: { type: true, location: true } },
            assigned_to_agent: { select: { id: true, phone: true, name: true, tenant_id: true } },
        },
    });

    // Group by agent
    const byAgent = new Map<string, typeof appts>();
    for (const a of appts) {
        if (!a.assigned_to_agent?.phone) continue;
        const k = a.assigned_to_agent.id;
        if (!byAgent.has(k)) byAgent.set(k, [] as any);
        byAgent.get(k)!.push(a);
    }

    for (const [agentId, list] of byAgent) {
        const sorted = [...list].sort((a, b) => a.scheduled_at.getTime() - b.scheduled_at.getTime());
        const lines = sorted.map((a, i) => {
            const time = a.scheduled_at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
            const customer = a.contact?.name || 'Customer';
            const prop = `${a.property?.type || 'Property'} ${a.property?.location || ''}`.trim();
            return `${i + 1}. ${customer} — ${prop} — ${time}`;
        }).join('\n');

        const dateStr = startUtc.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
        const phone = sorted[0].assigned_to_agent!.phone!;
        const tenantId = sorted[0].assigned_to_agent!.tenant_id;

        try {
            await whatsapp.sendTemplate(phone, 'rp_visit_daily_schedule', {
                date: dateStr,
                visit_list: lines,
            });
            await prisma.interaction.create({
                data: {
                    tenant_id: tenantId,
                    phone_number: phone,
                    channel: 'whatsapp',
                    direction: 'outbound',
                    event_type: 'pipeline_mgr_daily_schedule',
                    content: `Daily schedule (${list.length} visits)`,
                    metadata: { agent_id: agentId, count: list.length, date: dateStr },
                },
            });
            logger.info(`[PipelineCron] Daily schedule sent to ${phone} (${list.length} visits)`);
        } catch (err) {
            logger.warn(`[PipelineCron] Daily schedule send failed for agent ${agentId}:`, err);
        }
    }
}

// ─── 7. Stage 4: 24hr-before per-visit briefing to lead manager ──────────────
//
// Runs every 30 min. For each appointment scheduled in the 23.5-24.5hr window,
// send a per-deal briefing to the assigned agent. Reuses rp_visit_manager_1hr
// (closest existing template; richer template can be swapped in later).

async function runManager24hrBriefing(): Promise<void> {
    const now = Date.now();
    const windowStart = new Date(now + 23.5 * 60 * 60 * 1000);
    const windowEnd = new Date(now + 24.5 * 60 * 60 * 1000);

    const appts = await prisma.appointment.findMany({
        where: {
            scheduled_at: { gte: windowStart, lte: windowEnd },
            status: { in: ['scheduled', 'confirmed'] },
            assigned_to_agent_id: { not: null },
        },
        include: {
            contact: { select: { name: true } },
            property: { select: { type: true, location: true } },
            assigned_to_agent: { select: { id: true, phone: true, tenant_id: true } },
        },
    });

    for (const appt of appts) {
        if (!appt.assigned_to_agent?.phone) continue;

        const already = await prisma.interaction.findFirst({
            where: {
                event_type: 'pipeline_mgr_24hr_briefing',
                metadata: { path: ['appointment_id'], equals: appt.id },
            },
            select: { id: true },
        });
        if (already) continue;

        const customer = appt.contact?.name || 'Customer';
        const property = appt.property?.type || 'Property';
        const location = appt.property?.location || 'Location TBD';
        const time = appt.scheduled_at.toLocaleString('en-IN', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
        });

        try {
            await whatsapp.sendTemplate(appt.assigned_to_agent.phone, 'rp_visit_manager_1hr', {
                customer_name: customer,
                property,
                location,
                time,
            });
            await prisma.interaction.create({
                data: {
                    tenant_id: appt.assigned_to_agent.tenant_id,
                    phone_number: appt.assigned_to_agent.phone,
                    channel: 'whatsapp',
                    direction: 'outbound',
                    event_type: 'pipeline_mgr_24hr_briefing',
                    content: `24hr briefing for visit with ${customer}`,
                    metadata: { appointment_id: appt.id, agent_id: appt.assigned_to_agent.id },
                },
            });
            logger.info(`[PipelineCron] 24hr briefing sent for appt ${appt.id}`);
        } catch (err) {
            logger.warn(`[PipelineCron] 24hr briefing failed for appt ${appt.id}:`, err);
        }
    }
}
