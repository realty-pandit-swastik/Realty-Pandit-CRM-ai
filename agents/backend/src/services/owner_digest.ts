/**
 * Consolidated owner digest (2026-05-19).
 *
 * Replaces the scattered odd-hour WhatsApp reports. ONE message to every
 * super_boss at 08:00 IST (morning) and 20:00 IST (evening) — built from the
 * latest behaviour-audit run. Critical section = R4 (real client ignored,
 * autoresponders skipped) + R2 (Meta 24h-window rejects). R5/R6/R7 collapse
 * to a one-line ops backlog count (the weekly ops digest carries detail).
 *
 * Real-time WhatsApp is now reserved for true system-down only (see
 * utils/alerter.ts). See docs/plans/2026-05-19-report-cadence-and-bot-reply.md
 */

import prisma from '../db';
import logger from './../utils/logger';
import { WhatsAppService } from './whatsapp';

const whatsapp = new WhatsAppService();

// Third-party autoresponders / junk that must NOT count as "bot ignored a
// real client" (R4 false positives the owner complained about).
const AUTORESPONDER_RE = /thank you for contacting|please let us know how we can help|do not reply|automated message|out of office|this is an automated/i;

const OPS_RULES = new Set(['R5', 'R6', 'R7']);

async function getSuperBossPhones(): Promise<string[]> {
    const agents = await prisma.agent.findMany({
        where: { role: 'super_boss', status: 'active' },
        select: { phone: true },
    }).catch(() => [] as { phone: string | null }[]);
    return agents.map(a => a.phone).filter((p): p is string => Boolean(p));
}

interface Finding {
    rule_id?: string;
    rule_name?: string;
    severity?: string;
    contact_phone?: string | null;
    contact_name?: string | null;
    evidence?: string;
}

function buildMessage(period: 'morning' | 'evening', findings: Finding[], reportAt: Date | null): string {
    const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
    const valid = findings.filter(f => f && f.rule_id); // drops the blank-finding bug rows
    const r4 = valid.filter(f => f.rule_id === 'R4' && !AUTORESPONDER_RE.test(f.evidence || ''));
    const r2 = valid.filter(f => f.rule_id === 'R2');
    const ops = valid.filter(f => f.rule_id && OPS_RULES.has(f.rule_id));
    const opsByRule: Record<string, number> = {};
    for (const f of ops) opsByRule[f.rule_id!] = (opsByRule[f.rule_id!] || 0) + 1;

    const L: string[] = [];
    L.push(`🤖 *Panditji ${period === 'morning' ? 'Morning' : 'Evening'} Digest*`);
    L.push(now);
    if (reportAt) L.push(`_(audit: ${new Date(reportAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })})_`);
    L.push('');

    // 1. Clients the AI did NOT reply to (the revenue-critical one)
    L.push(`🔴 *Clients not replied (R4):* ${r4.length}`);
    for (const f of r4.slice(0, 8)) {
        L.push(`• ${f.contact_name || 'Lead'} (${f.contact_phone || '?'})`);
        L.push(`  ${(f.evidence || '').slice(0, 140)}`);
    }
    if (r4.length > 8) L.push(`  …and ${r4.length - 8} more`);
    L.push('');

    // 2. Messages Meta will reject (deliverability) — kept daily per owner
    L.push(`🟠 *Free-form blocked by 24h window (R2):* ${r2.length}`);
    if (r2.length > 0) {
        const top = r2.slice(0, 4).map(f => `${f.contact_name || f.contact_phone || '?'}`).join(', ');
        L.push(`  ${top}${r2.length > 4 ? ` +${r2.length - 4}` : ''}`);
    }
    L.push('');

    // 3. Ops backlog — counts only (detail in the weekly ops digest)
    const opsTotal = ops.length;
    L.push(`🟡 *Ops backlog:* ${opsTotal}` + (opsTotal
        ? ` (${Object.entries(opsByRule).map(([k, v]) => `${k}:${v}`).join(', ')})`
        : ''));
    L.push('');

    if (r4.length === 0 && r2.length === 0) {
        L.push('✅ No client-reply or deliverability issues in the last audit.');
        L.push('');
    }
    L.push('_Full detail: admin → AI Audit. Real-time alerts now only for system-down._');
    return L.join('\n');
}

/**
 * Send the consolidated digest. `period` controls the header only — content
 * is the latest behaviour-audit snapshot either way. Never throws.
 */
export async function sendOwnerDigest(period: 'morning' | 'evening'): Promise<void> {
    try {
        const phones = await getSuperBossPhones();
        if (phones.length === 0) {
            logger.warn('[OwnerDigest] No super_boss phones — skipping');
            return;
        }

        const latest = await prisma.auditReport.findFirst({
            where: { agent_breakdown: { path: ['source'], equals: 'behavior_auditor' } },
            orderBy: { created_at: 'desc' },
            select: { created_at: true, issues_found: true },
        }).catch(() => null);

        const findings: Finding[] = Array.isArray(latest?.issues_found)
            ? (latest!.issues_found as unknown as Finding[])
            : [];

        const msg = buildMessage(period, findings, latest?.created_at ?? null);

        let sent = 0;
        for (const phone of phones) {
            try {
                await whatsapp.sendText(phone, msg);
                sent++;
            } catch (err) {
                logger.warn(`[OwnerDigest] send failed for ${phone}: ${(err as Error).message}`);
            }
        }
        logger.info(`[OwnerDigest] ${period} digest sent to ${sent}/${phones.length} super_boss (findings=${findings.length})`);
    } catch (err) {
        logger.error('[OwnerDigest] failed:', err);
    }
}
