/**
 * Central WhatsApp compliance gate.
 *
 * WHY (2026-08-07): opt-out enforcement was scattered and incomplete. An audit of
 * every proactive sender found `opted_out_at` missing from interaction_engine,
 * scheduled_worker's session-keepalive, inventory_broadcast, marketing_agent's
 * audience builder, deal_notifications and three pipeline_crons jobs. Contacts
 * with a Transaction were *accidentally* protected (the STOP handler also flips
 * `ai_paused`), but anyone without one was not protected at all.
 *
 * Rather than patch nine senders and hope the tenth remembers, the category gate
 * lives at the single choke point every template send passes through
 * (`whatsapp.ts:sendTemplate`). Per-sender guards still exist so crons skip work
 * cheaply, but the gate is the backstop.
 *
 * ⚠ FREE-FORM TEXT IS DELIBERATELY NOT GATED HERE. Free-form is only legal inside
 * the 24h customer-initiated window — i.e. the customer just messaged us. Gating
 * that would break legitimate replies, which were never the compliance problem.
 *
 * ⚠ FAIL-OPEN. Every predicate returns "allow" if Redis or Postgres hiccups. A
 * transient infra fault must never silence the bot mid-conversation.
 *
 * Safe to gate at the template layer because every property-card template is
 * UTILITY (verified in config/whatsapp_templates.ts) — the MARKETING set is only
 * 8 templates, all of them re-engagement/nudge/broadcast.
 */

import prisma from '../db';
import logger from '../utils/logger';
import { cacheGet, cacheSet } from '../utils/redis';
import { isQuietHours } from '../utils/quiet_hours';
import { TEMPLATE_REGISTRY } from '../config/whatsapp_templates';

export type BlockReason = 'marketing_disabled' | 'opted_out' | 'quiet_hours' | 'throttle_suppressed';

const OPTOUT_TTL = 300;              // 5 min — opt-out is rare and latency matters on the hot path
const OPTOUT_KEY = (p: string) => `wa:optout:${p}`;
const THROTTLE_KEY = (p: string) => `wa:throttle:${p}`;

/** Flag helper — mirrors the COLD_NUDGE_ENABLED idiom (pipeline_crons.ts): unset ⇒ OFF. */
export function flagEnabled(name: string, defaultOn = false): boolean {
    const v = process.env[name];
    if (v === undefined || v === '') return defaultOn;
    return v === 'true';
}

/**
 * Has this contact asked us to stop? Redis-cached; FAILS OPEN.
 * Reads `contacts.opted_out_at` — the CONSENT field, deliberately separate from
 * `lost_reason` (a pipeline outcome).
 */
export async function isOptedOut(phone: string): Promise<boolean> {
    try {
        const cached = await cacheGet(OPTOUT_KEY(phone));
        if (cached !== null) return cached === '1';

        const c = await prisma.contact.findUnique({
            where: { phone_number: phone },
            select: { opted_out_at: true },
        });
        const out = !!c?.opted_out_at;
        await cacheSet(OPTOUT_KEY(phone), out ? '1' : '0', OPTOUT_TTL).catch(() => {});
        return out;
    } catch (err) {
        logger.warn(`[WACompliance] isOptedOut failed for ${phone}, failing OPEN: ${(err as Error).message}`);
        return false;
    }
}

/**
 * Bulk variant for crons — ONE query for N phones instead of N queries.
 * Returns the subset that has opted out. Fails open (empty set).
 */
export async function optedOutSet(phones: string[]): Promise<Set<string>> {
    if (!phones.length) return new Set();
    try {
        const rows = await prisma.contact.findMany({
            where: { phone_number: { in: phones }, opted_out_at: { not: null } },
            select: { phone_number: true },
        });
        return new Set(rows.map(r => r.phone_number));
    } catch (err) {
        logger.warn(`[WACompliance] optedOutSet failed, failing OPEN: ${(err as Error).message}`);
        return new Set();
    }
}

/**
 * Recipient-level cooldown set by the 131049/131048/131026 handler. Prevents us
 * from hammering a recipient Meta has already told us to back off from — the
 * behaviour that accumulates into an account-level "Sending spam" restriction.
 */
export async function suppressRecipient(phone: string, ttlSec: number, code: number | null): Promise<void> {
    if (ttlSec <= 0) return;
    try {
        await cacheSet(THROTTLE_KEY(phone), String(code ?? 'unknown'), ttlSec);
        logger.warn(`[WACompliance] suppressing proactive sends to ${phone} for ${ttlSec}s (Meta code ${code})`);
    } catch (err) {
        logger.warn(`[WACompliance] suppressRecipient failed for ${phone}: ${(err as Error).message}`);
    }
}

export async function isThrottleSuppressed(phone: string): Promise<boolean> {
    try {
        return (await cacheGet(THROTTLE_KEY(phone))) !== null;
    } catch {
        return false;
    }
}

/**
 * The gate. Returns null to allow, or the reason to block.
 *
 * MARKETING → requires WA_MARKETING_ENABLED, no opt-out, no quiet hours, no throttle cooldown.
 * UTILITY / AUTHENTICATION → opt-out and throttle cooldown only. These are transactional
 * (property cards, OTPs, visit confirmations) and must keep working around the clock.
 */
export async function gateTemplateSend(to: string, templateKey: string): Promise<BlockReason | null> {
    const def = TEMPLATE_REGISTRY[templateKey];
    const category = def?.category ?? 'UTILITY';   // unknown key ⇒ treat as transactional, fail open

    if (await isOptedOut(to)) return 'opted_out';
    if (await isThrottleSuppressed(to)) return 'throttle_suppressed';

    if (category === 'MARKETING') {
        if (!flagEnabled('WA_MARKETING_ENABLED')) return 'marketing_disabled';
        if (isQuietHours()) return 'quiet_hours';
    }

    return null;
}
