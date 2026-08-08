/**
 * New-lead alert pipeline.
 *
 * Two responsibilities:
 *  1. Auto-assign new WhatsApp-source contacts to the designated super_boss
 *     ("Sunny Sharma" → Savikant Sharma in the agents table). All other sources
 *     keep whatever assignment logic the upstream caller chose.
 *  2. Fire a WhatsApp text + push notification to (a) the designated super_boss
 *     and (b) the assigned agent (if any, and not the same person), every time
 *     a fresh demand-side lead (BUYER/TENANT/UNKNOWN) enters the CRM — from any
 *     source.
 *
 * Wired in via Prisma client extension on `contact.create` so it covers all
 * ~14 contact-creation paths (webhook_processor, magicbricks, 99acres,
 * housing, voice, chat, email, OTP signup, etc.) without touching each one.
 *
 * 2026-05-14 — built after Puneet asked for new-lead WhatsApp + in-app alerts.
 */

import logger from '../utils/logger';
import { WhatsAppService } from './whatsapp';

// Source slugs that should auto-route to the designated super_boss when the
// caller didn't set assigned_agent_id explicitly.
const AUTO_ASSIGN_SOURCES = new Set([
    'whatsapp',
    'whatsapp_inbound',
    'panditji_voice',
    'voice',
    // 2026-08-07: social leads were excluded, so a Contact created from an Instagram/Facebook
    // comment or DM got NO assigned_agent_id at create time. buildContactVisibilityFilter
    // (middleware/contact_visibility.ts) then hid it from every manager and employee — only a
    // super_boss login could see it. Assignment previously depended entirely on
    // ensureDealForLead's round-robin fallback finding an eligible agent, and produced an
    // "Assigned: Unassigned" new-lead alert. These are real inbound leads; treat them as such.
    'instagram',
    'facebook',
]);

const DEMAND_TYPES = new Set(['BUYER', 'TENANT', 'UNKNOWN']);

let _sunnyCache: { id: string; name: string | null; phone: string | null; email: string | null } | null = null;
let _sunnyCacheAt = 0;
const CACHE_MS = 5 * 60 * 1000;

/**
 * Resolve the designated super_boss who acts as "Sunny Sharma" — the recipient
 * of every new-lead alert. Resolution preference:
 *   1. SUNNY_AGENT_ID env var (explicit override)
 *   2. agent name match "Savikant Sharma"
 *   3. any active super_boss (first by created_at)
 */
async function getSunny(prisma: any) {
    if (_sunnyCache && Date.now() - _sunnyCacheAt < CACHE_MS) return _sunnyCache;

    const select = { id: true, name: true, phone: true, email: true };

    if (process.env.SUNNY_AGENT_ID) {
        const a = await prisma.agent.findUnique({ where: { id: process.env.SUNNY_AGENT_ID }, select });
        if (a) { _sunnyCache = a; _sunnyCacheAt = Date.now(); return a; }
    }
    let a = await prisma.agent.findFirst({
        where: { name: { contains: 'Savikant Sharma', mode: 'insensitive' }, role: 'super_boss', status: 'active' },
        select,
    });
    if (!a) {
        a = await prisma.agent.findFirst({
            where: { role: 'super_boss', status: 'active' },
            orderBy: { created_at: 'asc' },
            select,
        });
    }
    if (a) { _sunnyCache = a; _sunnyCacheAt = Date.now(); }
    return a;
}

/**
 * Returns true if a freshly-created contact with this source should default to
 * Sunny when the caller didn't set assigned_agent_id.
 */
export function shouldAutoAssignToSunny(source: string | null | undefined): boolean {
    if (!source) return false;
    return AUTO_ASSIGN_SOURCES.has(source.toLowerCase());
}

interface ContactLite {
    phone_number: string;
    name: string | null;
    source: string;
    contact_type: string | null;
    intent: string | null;
    preferred_location: string | null;
    budget_min: any;
    budget_max: any;
    demand_bhk: string | null;
    assigned_agent_id: string | null;
}

/**
 * Fire WhatsApp text + push to Sunny + assigned agent. Always called
 * fire-and-forget — never await this from a write path.
 */
export async function fireNewLeadAlerts(prisma: any, contact: ContactLite): Promise<void> {
    try {
        if (!contact?.contact_type || !DEMAND_TYPES.has(contact.contact_type)) return;

        const wa = new WhatsAppService();
        const sunny = await getSunny(prisma);

        // Resolve assigned agent details (if different from Sunny)
        let assignedAgent: { id: string; name: string | null; phone: string | null; email: string | null } | null = null;
        if (contact.assigned_agent_id && contact.assigned_agent_id !== sunny?.id) {
            assignedAgent = await prisma.agent.findUnique({
                where: { id: contact.assigned_agent_id },
                select: { id: true, name: true, phone: true, email: true },
            });
        }

        const lines = [
            '📋 *New Lead in CRM*',
            '',
            `👤 Name: ${contact.name || 'Unknown'}`,
            `📞 Phone: ${contact.phone_number}`,
            `📡 Source: ${contact.source}`,
            `🎯 Type: ${contact.contact_type}${contact.intent ? ` · ${contact.intent}` : ''}`,
        ];
        if (contact.preferred_location) lines.push(`📍 Location: ${contact.preferred_location}`);
        if (contact.budget_min || contact.budget_max) {
            const fmt = (n: any) => {
                const v = Number(n);
                if (!Number.isFinite(v) || v <= 0) return null;
                if (v >= 10000000) return `${(v / 10000000).toFixed(2)} Cr`;
                if (v >= 100000) return `${(v / 100000).toFixed(2)} L`;
                return `${v.toLocaleString('en-IN')}`;
            };
            const mn = fmt(contact.budget_min);
            const mx = fmt(contact.budget_max);
            if (mn || mx) lines.push(`💰 Budget: ${mn || '—'} to ${mx || '—'}`);
        }
        const _bhk = (contact as any).demand_schema_values?.bhk; // demand_bhk col dropped 2026-05-29
        if (_bhk) lines.push(`🏠 BHK: ${_bhk}`);
        lines.push('');
        lines.push(`👥 Assigned: ${assignedAgent?.name || sunny?.name || 'Unassigned'}`);
        const body = lines.join('\n');

        // Send to Sunny — always
        if (sunny?.phone) {
            const num = sunny.phone.replace(/^\+/, '');
            wa.sendText(num, body).catch(err => {
                logger.warn(`[NewLeadAlert] WhatsApp to Sunny (${num}) failed: ${(err as Error).message}`);
            });
        }

        // Send to assigned agent (if they're a different person)
        if (assignedAgent?.phone) {
            const num = assignedAgent.phone.replace(/^\+/, '');
            const personalLines = [...lines];
            // Replace the "Assigned:" line with a personal "This lead is yours" note
            personalLines[personalLines.length - 1] = `👋 *Hi ${assignedAgent.name || ''} — this lead is assigned to you.*`;
            wa.sendText(num, personalLines.join('\n')).catch(err => {
                logger.warn(`[NewLeadAlert] WhatsApp to agent (${num}) failed: ${(err as Error).message}`);
            });
        }

        // Push + in-app via existing notify pipeline
        try {
            const { notify } = await import('./notify');
            const recipients: any[] = [];
            if (sunny) recipients.push({ id: sunny.id, type: 'agent', phone: sunny.phone || undefined, email: sunny.email || undefined, name: sunny.name || undefined });
            if (assignedAgent) recipients.push({ id: assignedAgent.id, type: 'agent', phone: assignedAgent.phone || undefined, email: assignedAgent.email || undefined, name: assignedAgent.name || undefined });
            if (recipients.length > 0) {
                notify('new_lead_arrived', recipients, {
                    contact_name: contact.name || 'Unknown',
                    contact_phone: contact.phone_number,
                    source: contact.source,
                    contact_type: contact.contact_type,
                    intent: contact.intent,
                    location: contact.preferred_location,
                    assigned_agent_name: assignedAgent?.name || sunny?.name,
                });
            }
        } catch (err) {
            logger.warn(`[NewLeadAlert] notify() failed (non-blocking): ${(err as Error).message}`);
        }

        logger.info(`[NewLeadAlert] Fired alerts for new lead ${contact.phone_number} (source=${contact.source}, assigned=${assignedAgent?.name || sunny?.name || 'none'})`);
    } catch (err) {
        logger.error(`[NewLeadAlert] Unhandled error firing alerts:`, err);
    }
}

/**
 * Resolve Sunny's agent ID — used by the Prisma extension to auto-assign
 * WhatsApp-source contacts. Returns null if no super_boss found.
 */
export async function resolveSunnyAgentId(prisma: any): Promise<string | null> {
    const s = await getSunny(prisma);
    return s?.id || null;
}
