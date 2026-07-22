/**
 * P2 (2026-05-18) — push a member's own deal reminders into THEIR Google
 * Calendar (with pop-up alerts) + Google Tasks.
 *
 * Fire-and-forget from POST /api/deals/:id/reminder. Opt-in: silently skips
 * unless the member connected Google (P1) and sync is enabled. Idempotent —
 * the created event/task ids are stored back in Task.stage_metadata so a
 * re-run patches instead of duplicating.
 *
 * See docs/plans/2026-05-18-google-calendar-task-reminder-sync.md
 */

import { google } from 'googleapis';
import prisma from '../db';
import logger from '../utils/logger';
import { getAuthedClient } from './google_oauth';
import { captureBackgroundError } from '../utils/capture';

const ADMIN_PANEL_URL = process.env.ADMIN_PANEL_URL || 'https://admin.realtypandit.in';
const TZ = 'Asia/Kolkata';
const EVENT_LEN_MIN = 15;

function isInvalidGrant(err: any): boolean {
    const e = err?.response?.data?.error || err?.errors?.[0]?.reason || err?.message || '';
    return /invalid_grant|invalid_rapt|Token has been expired or revoked/i.test(String(e));
}

// Google 403: the member connected Google (sign-in) but the token lacks the Calendar/Tasks
// scope, so the API returns "Insufficient Permission". Benign — handled like a dead token
// (wipe + reconnect nudge) so the member re-grants the scope; NOT a bug to report to GlitchTip.
function isInsufficientScope(err: any): boolean {
    const status = err?.response?.status ?? err?.code;
    const reason = String(err?.response?.data?.error || err?.errors?.[0]?.reason || err?.message || '');
    return Number(status) === 403 && /insufficientPermissions|permission_denied|insufficient permission|insufficient authentication scopes/i.test(reason);
}

/**
 * On a hard auth failure the stored refresh token is dead — wipe the link so
 * the member's profile card flips back to "Connect Google", and push them a
 * reconnect nudge (P4). Never throws.
 */
async function handleDeadToken(agentId: string, ctx: string): Promise<void> {
    try {
        const ag = await prisma.agent.findUnique({
            where: { id: agentId }, select: { name: true },
        });
        await prisma.agent.update({
            where: { id: agentId },
            data: {
                google_refresh_token: null,
                google_email: null,
                google_connected_at: null,
                google_sync_enabled: true,
            },
        });
        logger.warn(`[GoogleSync] Cleared dead Google token for agent ${agentId} (${ctx})`);
        const { notify } = await import('./notify');
        await notify('google_disconnected', [{ id: agentId, type: 'agent', name: ag?.name || undefined }], {});
    } catch (e) {
        logger.error(`[GoogleSync] Failed clearing dead token for ${agentId}:`, e);
    }
}

/**
 * Delete a member's linked Calendar event and/or Google Task from THAT
 * member's account (used for cancel/complete + reassignment-from-old).
 * Best-effort: swallows 404 (already gone) and invalid_grant. Never throws.
 */
async function deleteGoogleArtifacts(
    agentId: string,
    ids: { eventId?: string | null; taskId?: string | null },
): Promise<void> {
    try {
        const ag = await prisma.agent.findUnique({
            where: { id: agentId },
            select: { google_refresh_token: true },
        });
        if (!ag?.google_refresh_token) return; // old member disconnected — nothing to do
        const auth = getAuthedClient(ag.google_refresh_token);
        if (ids.eventId) {
            try {
                await google.calendar({ version: 'v3', auth })
                    .events.delete({ calendarId: 'primary', eventId: ids.eventId });
            } catch (e: any) { if (e?.code !== 404 && e?.code !== 410) throw e; }
        }
        if (ids.taskId) {
            try {
                await google.tasks({ version: 'v1', auth })
                    .tasks.delete({ tasklist: '@default', task: ids.taskId });
            } catch (e: any) { if (e?.code !== 404) throw e; }
        }
    } catch (e) {
        logger.warn(`[GoogleSync] deleteGoogleArtifacts(${agentId}) best-effort failed:`, (e as any)?.message || e);
    }
}

/**
 * Cancel a reminder's synced Google Calendar event + Google Task immediately —
 * used when a newer reminder supersedes it (#3, 2026-07-01). Best-effort; nulls
 * the stored ids on the task so nothing tries to re-touch them.
 */
export async function cancelReminderGoogle(taskId: string): Promise<void> {
    try {
        const t = await prisma.task.findUnique({ where: { id: taskId }, select: { assigned_to: true, stage_metadata: true } });
        if (!t) return;
        const m: any = t.stage_metadata || {};
        if (!m.google_event_id && !m.google_task_id) return;
        await deleteGoogleArtifacts(m.google_synced_agent_id || t.assigned_to, { eventId: m.google_event_id, taskId: m.google_task_id });
        await prisma.task.update({
            where: { id: taskId },
            data: { stage_metadata: { ...m, google_event_id: null, google_task_id: null, google_synced_agent_id: null } } as any,
        });
    } catch (e) {
        logger.warn(`[GoogleSync] cancelReminderGoogle(${taskId}) failed:`, (e as any)?.message || e);
    }
}

/**
 * Push (or update) the Google Calendar event + Google Task for a REMINDER
 * task. `taskId` is the Task created in the reminder endpoint.
 */
export async function pushReminderToGoogle(taskId: string): Promise<void> {
    try {
        const task = await prisma.task.findUnique({
            where: { id: taskId },
            select: {
                id: true, title: true, description: true, due_date: true,
                task_type: true, deal_id: true, contact_phone: true,
                assigned_to: true, stage_metadata: true,
                contact: { select: { name: true } },
            },
        });
        if (!task || task.task_type !== 'REMINDER') return;

        const agent = await prisma.agent.findUnique({
            where: { id: task.assigned_to },
            select: {
                google_refresh_token: true, google_sync_enabled: true, name: true,
            },
        });
        // Opt-in: skip silently if not connected or sync paused.
        if (!agent?.google_refresh_token || agent.google_sync_enabled === false) return;

        const meta: any = (task.stage_metadata as any) || {};
        const advanceMin: number = Number(meta.advance_minutes) > 0 ? Number(meta.advance_minutes) : 30;
        const customer = task.contact?.name || task.contact_phone || 'your client';
        const note = task.description || task.title || 'Follow up with the client';
        const start = new Date(task.due_date);
        const end = new Date(start.getTime() + EVENT_LEN_MIN * 60 * 1000);
        const isNewLead = meta.kind === 'new_lead_call';
        // Per-deal deep link — opens the PWA straight to this deal (no name/phone hunting).
        // Falls back to the generic panel only when there is no linked deal.
        const dealLink = task.deal_id
            ? `👉 Open the deal: ${ADMIN_PANEL_URL}/?deal=${task.deal_id}`
            : `Open Realty Pandit → Deal Pipeline: ${ADMIN_PANEL_URL}`;
        const summary = isNewLead ? `📞 New lead — call ${customer}` : `⏰ Follow up: ${customer}`;

        const descLines = [
            note,
            '',
            `Customer: ${customer}`,
            task.contact_phone ? `📞 ${task.contact_phone}` : '',
            '',
            dealLink,
        ].filter(Boolean);

        const auth = getAuthedClient(agent.google_refresh_token);
        const calendar = google.calendar({ version: 'v3', auth });
        const tasksApi = google.tasks({ version: 'v1', auth });

        // ---- Calendar event (the actual timed alert) ----
        const eventBody = {
            summary,
            description: descLines.join('\n'),
            start: { dateTime: start.toISOString(), timeZone: TZ },
            end: { dateTime: end.toISOString(), timeZone: TZ },
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'popup', minutes: advanceMin },
                    { method: 'popup', minutes: 0 },
                ],
            },
        };

        let eventId: string | undefined = meta.google_event_id;
        try {
            if (eventId) {
                await calendar.events.patch({
                    calendarId: 'primary', eventId, requestBody: eventBody,
                });
            } else {
                const ins = await calendar.events.insert({
                    calendarId: 'primary', requestBody: eventBody,
                });
                eventId = ins.data.id || undefined;
            }
        } catch (err: any) {
            if (isInvalidGrant(err) || isInsufficientScope(err)) { await handleDeadToken(task.assigned_to, 'reminder/calendar'); return; }
            // 404 = the linked event was deleted in Google — recreate it.
            if (err?.code === 404 && meta.google_event_id) {
                const ins = await calendar.events.insert({ calendarId: 'primary', requestBody: eventBody });
                eventId = ins.data.id || undefined;
            } else {
                throw err;
            }
        }

        // ---- Google Task (the checklist mirror; Tasks API is date-only) ----
        const taskBody = {
            title: summary,
            notes: descLines.join('\n'),
            due: start.toISOString(), // time is ignored by the Tasks API
        };
        let gTaskId: string | undefined = meta.google_task_id;
        try {
            if (gTaskId) {
                await tasksApi.tasks.patch({
                    tasklist: '@default', task: gTaskId, requestBody: taskBody,
                });
            } else {
                const ins = await tasksApi.tasks.insert({
                    tasklist: '@default', requestBody: taskBody,
                });
                gTaskId = ins.data.id || undefined;
            }
        } catch (err: any) {
            if (isInvalidGrant(err) || isInsufficientScope(err)) { await handleDeadToken(task.assigned_to, 'reminder/tasks'); return; }
            if (err?.code === 404 && meta.google_task_id) {
                const ins = await tasksApi.tasks.insert({ tasklist: '@default', requestBody: taskBody });
                gTaskId = ins.data.id || undefined;
            } else {
                throw err;
            }
        }

        // ---- Persist ids back (idempotency) ----
        await prisma.task.update({
            where: { id: task.id },
            data: {
                stage_metadata: {
                    ...meta,
                    google_event_id: eventId || null,
                    google_task_id: gTaskId || null,
                    google_synced_agent_id: task.assigned_to,
                    google_synced_at: new Date().toISOString(),
                },
            } as any,
        });

        logger.info(`[GoogleSync] Reminder ${task.id} → Google for agent ${task.assigned_to} (event ${eventId}, task ${gTaskId})`);
    } catch (err) {
        // Never break the reminder flow — this is best-effort.
        captureBackgroundError(err, { source: 'google_sync#pushReminderToGoogle', taskId });
        logger.error(`[GoogleSync] pushReminderToGoogle failed for task ${taskId}:`, err);
    }
}

/**
 * Phase D (2026-06-18) — insert a one-off Google Task into a member's @default
 * task list (used by the team new-inventory broadcast). Opt-in: silently skips
 * unless the member connected Google + sync is enabled. Date-only due (Tasks API
 * ignores time). Best-effort: a dead/insufficient-scope token is wiped + nudged
 * like the reminder/appointment paths. Returns true only if a task was inserted.
 *
 * No idempotency store of its own — callers dedup upstream (the broadcast marker)
 * so this never double-fires for the same inventory.
 */
export async function pushInventoryTaskToGoogle(
    agentId: string,
    payload: { title: string; notes: string; dueISO?: string },
): Promise<boolean> {
    try {
        const agent = await prisma.agent.findUnique({
            where: { id: agentId },
            select: { google_refresh_token: true, google_sync_enabled: true },
        });
        if (!agent?.google_refresh_token || agent.google_sync_enabled === false) return false;

        const auth = getAuthedClient(agent.google_refresh_token);
        const tasksApi = google.tasks({ version: 'v1', auth });
        const body: any = { title: payload.title, notes: payload.notes };
        if (payload.dueISO) body.due = payload.dueISO;

        try {
            await tasksApi.tasks.insert({ tasklist: '@default', requestBody: body });
        } catch (err: any) {
            if (isInvalidGrant(err) || isInsufficientScope(err)) {
                await handleDeadToken(agentId, 'inventory-task');
                return false;
            }
            throw err;
        }
        logger.info(`[GoogleSync] Inventory task → Google for agent ${agentId}`);
        return true;
    } catch (err) {
        captureBackgroundError(err, { source: 'google_sync#pushInventoryTaskToGoogle', agentId });
        logger.warn(`[GoogleSync] pushInventoryTaskToGoogle(${agentId}) failed:`, (err as any)?.message || err);
        return false;
    }
}

const APPT_ACTIVE = ['scheduled', 'confirmed'];

/**
 * P3 — push (or update) a Google Calendar event for a property-visit
 * appointment, on the assigned member's own primary calendar. Opt-in +
 * idempotent (event id stored in Appointment.metadata). Future + active only.
 */
export async function pushAppointmentToGoogle(appointmentId: string): Promise<void> {
    try {
        const appt = await prisma.appointment.findUnique({
            where: { id: appointmentId },
            select: {
                id: true, title: true, description: true, notes: true,
                scheduled_at: true, duration: true, end_time: true, status: true,
                location: true, contact_id: true, assigned_to_agent_id: true,
                metadata: true,
                contact: { select: { name: true } },
                property: { select: { type: true, location: true } },
            },
        });
        if (!appt || !appt.assigned_to_agent_id) return;
        // Q1 (locked): future + active only.
        if (!APPT_ACTIVE.includes(String(appt.status))) return;
        if (new Date(appt.scheduled_at).getTime() < Date.now()) return;

        const agent = await prisma.agent.findUnique({
            where: { id: appt.assigned_to_agent_id },
            select: { google_refresh_token: true, google_sync_enabled: true },
        });
        if (!agent?.google_refresh_token || agent.google_sync_enabled === false) return;

        const meta: any = (appt.metadata as any) || {};
        const customer = appt.contact?.name || appt.contact_id || 'client';
        const start = new Date(appt.scheduled_at);
        const end = appt.end_time
            ? new Date(appt.end_time)
            : new Date(start.getTime() + (Number(appt.duration) || 30) * 60 * 1000);
        const place = appt.location || appt.property?.location || '';
        const descLines = [
            appt.description || appt.notes || appt.title || 'Property visit',
            '',
            `Customer: ${customer}`,
            appt.contact_id ? `📞 ${appt.contact_id}` : '',
            appt.property ? `Property: ${[appt.property.type, appt.property.location].filter(Boolean).join(' · ')}` : '',
            '',
            `Open Realty Pandit: ${ADMIN_PANEL_URL}`,
        ].filter(Boolean);

        const auth = getAuthedClient(agent.google_refresh_token);
        const calendar = google.calendar({ version: 'v3', auth });

        const eventBody: any = {
            summary: `🏠 Visit: ${customer}`,
            description: descLines.join('\n'),
            start: { dateTime: start.toISOString(), timeZone: TZ },
            end: { dateTime: end.toISOString(), timeZone: TZ },
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'popup', minutes: 30 },
                    { method: 'popup', minutes: 10 },
                ],
            },
        };
        if (place) eventBody.location = place;

        let eventId: string | undefined = meta.google_event_id;
        try {
            if (eventId) {
                await calendar.events.patch({ calendarId: 'primary', eventId, requestBody: eventBody });
            } else {
                const ins = await calendar.events.insert({ calendarId: 'primary', requestBody: eventBody });
                eventId = ins.data.id || undefined;
            }
        } catch (err: any) {
            if (isInvalidGrant(err) || isInsufficientScope(err)) { await handleDeadToken(appt.assigned_to_agent_id, 'appt/calendar'); return; }
            if (err?.code === 404 && meta.google_event_id) {
                const ins = await calendar.events.insert({ calendarId: 'primary', requestBody: eventBody });
                eventId = ins.data.id || undefined;
            } else {
                throw err;
            }
        }

        await prisma.appointment.update({
            where: { id: appt.id },
            data: {
                metadata: {
                    ...meta,
                    google_event_id: eventId || null,
                    google_synced_agent_id: appt.assigned_to_agent_id,
                    google_synced_at: new Date().toISOString(),
                },
            } as any,
        });
        logger.info(`[GoogleSync] Appointment ${appt.id} → Google for agent ${appt.assigned_to_agent_id} (event ${eventId})`);
    } catch (err) {
        captureBackgroundError(err, { source: 'google_sync#pushAppointmentToGoogle', appointmentId });
        logger.error(`[GoogleSync] pushAppointmentToGoogle failed for ${appointmentId}:`, err);
    }
}

/**
 * P3 — 5-min reconcile sweep (registered as BullMQ job `google-reconcile-sync`
 * in scheduled_worker.ts). Finds future+active reminders/appointments owned by
 * a Google-connected member that have no linked Google id yet and pushes them.
 *
 * This is the robustness layer: it covers every appointment.create site (not
 * just the hooked one) AND backfills items created before the member
 * connected Google. Capped + future-window bounded so it stays cheap.
 */
export async function reconcileGoogleSync(): Promise<void> {
    try {
        const now = new Date();
        const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

        const connected = await prisma.agent.findMany({
            where: { google_refresh_token: { not: null }, google_sync_enabled: true },
            select: { id: true },
        });
        if (connected.length === 0) return;
        const ids = connected.map(a => a.id);

        // Reminders (Task) — backfill / catch-all
        const tasks = await prisma.task.findMany({
            where: {
                task_type: 'REMINDER',
                assigned_to: { in: ids },
                status: { in: ['TODO', 'IN_PROGRESS'] },
                due_date: { gte: now, lte: horizon },
            },
            select: { id: true, stage_metadata: true },
            take: 200,
        });
        let pushed = 0;
        for (const t of tasks) {
            if (!((t.stage_metadata as any)?.google_event_id)) {
                await pushReminderToGoogle(t.id);
                pushed++;
            }
        }

        // Appointments — backfill (all create sites) + drift (reschedule/edit)
        // + reassignment mirror (P4). Active + future. NOT filtered by
        // connected agent: a reassigned-away appt must still be picked up so
        // we can delete it from the OLD member's calendar. Per-item gating +
        // orderBy/ take keep it bounded; pushAppointmentToGoogle itself skips
        // when the assignee isn't connected.
        const appts = await prisma.appointment.findMany({
            where: {
                status: { in: APPT_ACTIVE as any },
                scheduled_at: { gte: now, lte: horizon },
            },
            select: { id: true, metadata: true, updated_at: true, assigned_to_agent_id: true },
            orderBy: { updated_at: 'desc' },
            take: 300,
        });
        for (const a of appts) {
            const m: any = a.metadata || {};
            if (!m.google_event_id) {
                // New / backfill — only worth a call if the assignee is connected.
                if (a.assigned_to_agent_id && ids.includes(a.assigned_to_agent_id)) {
                    await pushAppointmentToGoogle(a.id);
                    pushed++;
                }
                continue;
            }
            const syncedAgent = m.google_synced_agent_id;
            if (syncedAgent && a.assigned_to_agent_id && syncedAgent !== a.assigned_to_agent_id) {
                // Reassigned: remove from the OLD member's calendar, clear the
                // link, then re-create on the NEW member's (if they connected).
                await deleteGoogleArtifacts(syncedAgent, { eventId: m.google_event_id });
                await prisma.appointment.update({
                    where: { id: a.id },
                    data: { metadata: { ...m, google_event_id: null, google_synced_agent_id: null } } as any,
                });
                if (a.assigned_to_agent_id && ids.includes(a.assigned_to_agent_id)) {
                    await pushAppointmentToGoogle(a.id);
                }
                pushed++;
            } else if (m.google_synced_at && a.updated_at > new Date(m.google_synced_at)) {
                // Rescheduled / edited after last sync → patch the event.
                await pushAppointmentToGoogle(a.id);
                pushed++;
            }
        }

        // ── Terminal cleanup (P4): cancel/complete → delete the Google copy ──
        const recent = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        let cleaned = 0;

        const deadAppts = await prisma.appointment.findMany({
            where: {
                status: { in: ['cancelled', 'completed', 'no_show', 'rescheduled'] as any },
                updated_at: { gte: recent },
            },
            select: { id: true, metadata: true, assigned_to_agent_id: true },
            orderBy: { updated_at: 'desc' },
            take: 300,
        });
        for (const a of deadAppts) {
            const m: any = a.metadata || {};
            if (!m.google_event_id) continue;
            await deleteGoogleArtifacts(m.google_synced_agent_id || a.assigned_to_agent_id, { eventId: m.google_event_id });
            await prisma.appointment.update({
                where: { id: a.id },
                data: { metadata: { ...m, google_event_id: null, google_synced_agent_id: null } } as any,
            });
            cleaned++;
        }

        const doneReminders = await prisma.task.findMany({
            where: {
                task_type: 'REMINDER',
                status: { in: ['DONE', 'BLOCKED'] },
                updated_at: { gte: recent },
            },
            select: { id: true, stage_metadata: true, assigned_to: true },
            orderBy: { updated_at: 'desc' },
            take: 300,
        });
        for (const t of doneReminders) {
            const m: any = t.stage_metadata || {};
            if (!m.google_event_id && !m.google_task_id) continue;
            await deleteGoogleArtifacts(m.google_synced_agent_id || t.assigned_to, {
                eventId: m.google_event_id, taskId: m.google_task_id,
            });
            await prisma.task.update({
                where: { id: t.id },
                data: { stage_metadata: { ...m, google_event_id: null, google_task_id: null, google_synced_agent_id: null } } as any,
            });
            cleaned++;
        }

        if (pushed > 0 || cleaned > 0) {
            logger.info(`[GoogleSync] reconcile sweep: pushed ${pushed}, cleaned ${cleaned}`);
        }
    } catch (err) {
        captureBackgroundError(err, { source: 'google_sync#reconcileGoogleSync' });
        logger.error('[GoogleSync] reconcileGoogleSync failed:', err);
    }
}
