/**
 * Housing.com Pull API Poller
 *
 * Polls the Housing.com broker leads API on a schedule (every 10 min via BullMQ)
 * to fetch new leads and ingest them into the CRM pipeline.
 *
 * API details (from official Broker CRM Integration Document):
 *   Endpoint : GET https://pahal.housing.com/api/v0/get-broker-leads
 *   Auth     : HMAC-SHA256(current_time_epoch_string, HOUSING_API_KEY) → hash param
 *   Required : start_date, end_date, current_time, hash, id
 *   Response : { "data": [ { lead_name, lead_phone, lead_email, flat_id,
 *                             project_name, locality, lead_date, service_type } ] }
 *   Limit    : 1000 per request (default 100)
 *   Auth TTL : 15-min window — request denied if current_time drift > 15 min
 */

import axios from 'axios';
import * as crypto from 'crypto';
import prisma from '../db';
import logger from '../utils/logger';
import { normalizePhone } from '../utils/phone';
import { isRealEmail } from '../utils/email';
import { sanitizeName } from '../utils/name_sanitizer';
import { sendBuyerConfirmationWhatsApp, sendBuyerConfirmationEmail } from './lead_notifications';
import { assignViaRoundRobin, resolveAgentByEmail, assignViaManagerRoundRobin } from './lead_assignment';
import { assignContact, type AssignmentMethod } from './assign_contact';
import { ensureDealForLead } from './ensure_deal';
import { notify } from './notify';
import { alertCritical } from '../utils/alerter';

// ── Types ────────────────────────────────────────────────────────────────────

interface HousingLead {
    lead_name?: string;
    lead_phone?: string;
    lead_email?: string;
    flat_id?: number | string;
    project_id?: number | string;
    project_name?: string;
    locality?: string;
    lead_date?: number | string;   // epoch
    pg_name?: string;
    service_type?: string;         // 'rent' | 'resale' | 'new-projects'
}

interface PollResult {
    fetched: number;
    new: number;
    updated: number;
}

// ── Poller Class ─────────────────────────────────────────────────────────────

export class HousingPoller {
    private readonly apiKey: string | undefined;
    private readonly accountId: string | undefined;
    private readonly baseUrl = 'https://pahal.housing.com/api/v0/get-broker-leads';

    constructor() {
        this.apiKey    = process.env.HOUSING_API_KEY;
        this.accountId = process.env.HOUSING_ACCOUNT_ID;
    }

    isConfigured(): boolean {
        return !!(this.apiKey && this.accountId);
    }

    /** HMAC-SHA256(currentTimeEpochString, apiKey) → hex string */
    private buildHash(currentTime: number): string {
        return crypto
            .createHmac('sha256', this.apiKey!)
            .update(String(currentTime))
            .digest('hex');
    }

    /** Map Housing.com service_type → our intent values */
    private mapIntent(serviceType?: string): string | null {
        if (!serviceType) return null;
        const st = serviceType.toLowerCase();
        if (st === 'rent') return 'rent';
        if (st === 'resale' || st === 'new-projects') return 'buy';
        return null;
    }

    async getSyncStatus() {
        return prisma.integrationSync.findUnique({ where: { source: 'housing' } });
    }

    async poll(): Promise<PollResult> {
        if (!this.isConfigured()) {
            throw new Error('Housing.com API not configured (missing HOUSING_API_KEY or HOUSING_ACCOUNT_ID)');
        }

        const tenant = await prisma.tenant.findFirst();
        if (!tenant) throw new Error('No tenant configured');

        // Mark running + stamp the attempt; read the watermark in the same call.
        // Uses the canonical IntegrationSync fields (last_success/last_error/consecutive_failures)
        // — the old code wrote started_at/completed_at/error which DON'T EXIST on the model.
        const sync = await prisma.integrationSync.upsert({
            where:  { source: 'housing' },
            update: { status: 'running', last_attempt: new Date() },
            create: { source: 'housing', status: 'running', last_attempt: new Date() },
        });

        // ── Window: resume from the watermark (last_success) so a missed/delayed tick can't
        // leave a permanent gap; first run / long outage falls back to the last 10 min, capped
        // to a 24h catch-up. (Old code used a fixed now-600s window with NO watermark.)
        const currentTime = Math.floor(Date.now() / 1000);
        const endTime     = currentTime;
        const MAX_LOOKBACK = 24 * 3600;
        let startTime = currentTime - 600;
        if (sync.last_success) {
            const wm = Math.floor(new Date(sync.last_success).getTime() / 1000);
            startTime = Math.max(wm, currentTime - MAX_LOOKBACK);
        }
        const hash = this.buildHash(currentTime);

        const params = new URLSearchParams({
            start_date:   String(startTime),
            end_date:     String(endTime),
            current_time: String(currentTime),
            hash,
            id:           this.accountId!,
            per_page:     '1000',
        });
        const url = `${this.baseUrl}?${params.toString()}`;
        logger.info(`[HousingPoller] Polling: start=${startTime} end=${endTime}`);

        const result: PollResult = { fetched: 0, new: 0, updated: 0 };

        try {
            const response = await axios.get(url, {
                timeout: 30000,
                headers: { 'Cache-Control': 'no-cache' },
            });

            // Response is wrapped in 'data' key: { "data": [...] }
            const body = response.data;
            if (body?.apiErrors) {
                throw new Error(`Housing.com API error: ${JSON.stringify(body.apiErrors)}`);
            }

            const leads: HousingLead[] = Array.isArray(body?.data) ? body.data : [];
            result.fetched = leads.length;
            logger.info(`[HousingPoller] Fetched ${leads.length} leads`);

            // Ingest — count failures. If ANY lead fails we do NOT advance the watermark and
            // we throw, so the sync is marked `failed` (alerts + backoff) and the window is
            // retried next cycle. Never silently drop a lead while reporting success.
            let leadFailures = 0;
            for (const lead of leads) {
                try {
                    await this.processLead(lead, tenant.id, result);
                } catch (err) {
                    leadFailures++;
                    logger.error(`[HousingPoller] Failed to ingest lead ${lead.lead_phone}:`, (err as Error).message);
                }
            }
            if (leadFailures > 0) {
                throw new Error(`Housing: ${leadFailures}/${leads.length} leads failed to ingest in window ${startTime}..${endTime}; watermark held for retry`);
            }

            // Full success → advance the watermark to the window end.
            await prisma.integrationSync.update({
                where: { source: 'housing' },
                data: {
                    status: 'success',
                    last_success: new Date(endTime * 1000),
                    last_error: null,
                    consecutive_failures: 0,
                    leads_fetched: result.fetched,
                    leads_new: result.new,
                    leads_updated: result.updated,
                    total_syncs: { increment: 1 },
                },
            });
            logger.info(`[HousingPoller] Done: ${result.fetched} fetched, ${result.new} new, ${result.updated} updated`);
            return result;

        } catch (err) {
            const message = (err as Error).message;
            logger.error('[HousingPoller] Poll failed:', message);
            const updated = await prisma.integrationSync.update({
                where: { source: 'housing' },
                data: {
                    status: 'failed',
                    last_error: message,
                    consecutive_failures: { increment: 1 },
                    leads_fetched: result.fetched,
                    leads_new: result.new,
                    leads_updated: result.updated,
                    total_syncs: { increment: 1 },
                },
            });
            if (updated.consecutive_failures >= 3) {
                alertCritical(
                    'housing_consecutive_failures',
                    `Housing poller has failed ${updated.consecutive_failures} times in a row. Last error: ${message.substring(0, 100)}`,
                    { consecutive_failures: updated.consecutive_failures, error: message },
                );
            }
            throw err;
        }
    }

    private async processLead(lead: HousingLead, tenantId: string, result: PollResult) {
        const phoneNumber = normalizePhone(lead.lead_phone);
        if (!phoneNumber) {
            logger.warn('[HousingPoller] Lead missing phone, skipping');
            return;
        }

        const leadName = sanitizeName(lead.lead_name);
        const incomingEmail = isRealEmail(lead.lead_email) ? lead.lead_email! : null;
        const intent = this.mapIntent(lead.service_type);
        const location = lead.locality || null;
        const propertyRef = lead.flat_id || lead.project_id || null;
        const projectName = lead.project_name || null;

        // ── Smart merge: fetch existing ─────────────────────────────────────
        const existing = await prisma.contact.findUnique({
            where:  { phone_number: phoneNumber },
            select: { name: true, email: true, assigned_agent_id: true },
        });

        // Smart merge email
        const mergedEmail: string | undefined = incomingEmail !== null
            ? incomingEmail
            : (existing?.email ?? undefined);

        // Smart merge name: keep the longer value (after stripping placeholders)
        const existingNameTrimmed = sanitizeName(existing?.name) || '';
        let mergedName: string | undefined;
        if (!leadName) {
            mergedName = undefined;
        } else if (!existingNameTrimmed) {
            mergedName = leadName;
        } else {
            mergedName = leadName.length >= existingNameTrimmed.length ? leadName : existingNameTrimmed;
        }

        const isNew = !existing;

        const contact = await prisma.contact.upsert({
            where: { phone_number: phoneNumber },
            update: {
                name:               mergedName,
                email:              mergedEmail,
                source:             'housing',
                intent:             intent || undefined,
                preferred_location: location || undefined,
                last_channel:       'housing',
                last_interaction:   new Date(),
            },
            create: {
                phone_number:     phoneNumber,
                name:             mergedName ?? null,
                email:            mergedEmail ?? null,
                source:           'housing',
                contact_type:     'BUYER',
                intent,
                preferred_location: location,
                tenant_id:        tenantId,
                last_channel:     'housing',
                last_interaction: new Date(),
                lead_status:      'warm',
            },
        });

        if (isNew) result.new++; else result.updated++;

        await prisma.interaction.create({
            data: {
                tenant_id:  tenantId,
                phone_number: phoneNumber,
                channel:    'housing',
                direction:  'inbound',
                event_type: 'lead_capture',
                content:    `Housing.com lead: ${leadName || 'Unknown'} interested in ${projectName || 'a property'} at ${location || 'N/A'} (${lead.service_type || 'N/A'})`,
                metadata: {
                    source:       'housing',
                    project_name: projectName,
                    property_ref: propertyRef,
                    service_type: lead.service_type,
                    lead_date:    lead.lead_date,
                    original_data: lead,
                },
            },
        });

        // ── Assign agent ────────────────────────────────────────────────────
        let finalAgentId = contact.assigned_agent_id;
        if (!finalAgentId) {
            let method: AssignmentMethod | null = null;
            // Try portal-email match first (parity with 99acres SubUserName routing).
            const housingBrokerEmail = (lead as any).broker_email || (lead as any).agent_email || null;
            if (housingBrokerEmail) {
                finalAgentId = await resolveAgentByEmail(housingBrokerEmail);
                if (finalAgentId) method = 'sub_user';
            }
            if (!finalAgentId) {
                finalAgentId = await assignViaManagerRoundRobin();
                if (finalAgentId) method = 'manager_review';
            }
            if (finalAgentId) {
                await assignContact(phoneNumber, finalAgentId, method);
            }
        }

        // Auto-create NEW deal (B1) — only on new contacts.
        if (isNew) {
            ensureDealForLead({
                contactPhone: phoneNumber,
                source: 'housing',
                assignedAgentId: finalAgentId,
            }).catch((err) => {
                logger.error(`[Housing] ensureDealForLead failed for ${phoneNumber}: ${(err as Error).message}`);
            });
        }

        // ── Notify team (new leads only) ────────────────────────────────────
        if (isNew && finalAgentId) {
            const [assignedAgent, superBoss] = await Promise.all([
                prisma.agent.findUnique({
                    where:  { id: finalAgentId },
                    select: { id: true, name: true, phone: true, email: true },
                }),
                prisma.agent.findFirst({
                    where:  { role: 'super_boss', status: 'active' },
                    select: { id: true, name: true, phone: true, email: true },
                }),
            ]);

            const recipients: any[] = [];
            if (assignedAgent) {
                recipients.push({ id: assignedAgent.id, type: 'agent', phone: assignedAgent.phone ?? undefined, email: assignedAgent.email, name: assignedAgent.name });
            }
            if (superBoss && superBoss.id !== finalAgentId) {
                recipients.push({ id: superBoss.id, type: 'agent', phone: superBoss.phone ?? undefined, email: superBoss.email, name: superBoss.name });
            }

            if (recipients.length > 0) {
                notify('lead_assigned', recipients, {
                    name:           contact.name || 'Unknown Buyer',
                    phone:          phoneNumber,
                    property_label: projectName || location || 'N/A',
                    source:         'Housing.com',
                }).catch(err => logger.warn('[HousingPoller] notify failed:', (err as Error).message));
            }

            // Enqueue 20-min escalation check
            try {
                const { scheduledJobsQueue } = await import('../queues/index');
                await scheduledJobsQueue.add('lead-escalation', {
                    phone_number:      phoneNumber,
                    assigned_agent_id: finalAgentId,
                    lead_name:         contact.name || null,
                    property_label:    projectName || location || null,
                    assigned_at:       new Date().toISOString(),
                }, { delay: 20 * 60 * 1000 });
            } catch (err) {
                logger.warn('[HousingPoller] Failed to enqueue escalation:', (err as Error).message);
            }
        }

        // ── Notify buyer (new leads only) ────────────────────────────────────
        if (isNew) {
            sendBuyerConfirmationWhatsApp(phoneNumber, leadName, 'housing')
                .catch(err => logger.warn('[HousingPoller] Buyer WA failed:', (err as Error).message));
            if (incomingEmail) {
                sendBuyerConfirmationEmail(incomingEmail, leadName)
                    .catch(err => logger.warn('[HousingPoller] Buyer email failed:', (err as Error).message));
            }
        }
    }
}
