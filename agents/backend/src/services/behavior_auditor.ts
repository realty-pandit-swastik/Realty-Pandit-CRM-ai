/**
 * Behavior Auditor — Rule-based audit of bot behavior over the last 24h.
 *
 * Complements `audit_agent.ts` (which uses LLM to score conversation quality).
 * This auditor runs deterministic rules across interactions/deals/contacts to flag
 * structural regressions: messages to wrong contact types, race-condition duplicates,
 * unanswered inbound, deals stuck in stages, closing signals ignored, etc.
 *
 * Output:
 *   - Persists findings to the existing `audit_reports.issues_found` jsonb column
 *   - Sends a daily digest WhatsApp + email to super_boss agents at 9:30 AM IST
 *   - Sends an immediate WhatsApp alert for any CRITICAL severity finding
 *
 * Wired from BullMQ via the `behavior-audit` scheduled job (see scheduled_worker.ts).
 */

import prisma from '../db';
import logger from '../utils/logger';
import { WhatsAppService } from './whatsapp';
import { TransactionStatus } from '@prisma/client';

const whatsapp = new WhatsAppService();

// ─── Severity & Finding Types ─────────────────────────────────────

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface Finding {
    rule_id: string;          // e.g. 'R1'
    rule_name: string;        // human title
    severity: Severity;
    deal_id?: string | null;
    contact_phone?: string | null;
    contact_name?: string | null;
    evidence: string;         // short factual line, no PII bloat
    suggested_fix: string;
    detected_at: string;      // ISO timestamp
}

export interface AuditRunResult {
    window_hours: number;
    findings: Finding[];
    counts_by_rule: Record<string, number>;
    counts_by_severity: Record<Severity, number>;
    started_at: string;
    finished_at: string;
}

// ─── Tunables ────────────────────────────────────────────────────

const WINDOW_HOURS = 24;
const REPLY_SLA_MINUTES = 10;          // R4: inbound msg → outbound reply within X min
const STAGE_NEW_MAX_HOURS = 24;        // R5: NEW deal age limit
const STAGE_QUALIFIED_MAX_DAYS = 7;    // R6: QUALIFIED with no property_shared
const TEMPLATE_REPEAT_LIMIT = 3;       // R8: same template fired N+ times to same contact
const BUSINESS_START_IST = 8;
const BUSINESS_END_IST = 21;
const IST_OFFSET_MINUTES = 5 * 60 + 30;

// Closing-signal regex shared with webhook_processor.ts (R9 keeps these in sync).
const CLOSING_SIGNAL_PATTERNS: RegExp[] = [
    /humne\s*(le|li|liya|li\s*hai|kha?ri?d)/i,
    /already\s*(bought|got|taken|purchased|finalized|done)/i,
    /\bnot\s*interested\b/i,
    /\bno\s*(thanks|thank\s*you|thanx)\b/i,
    /\bmat\s*bhejo\b/i,
    /\bstop\s*(messages?|messaging|sending)\b/i,
    /\bunsubscribe\b/i,
    /property\s*mil\s*(gayi|gaya|gay[ai])/i,
    /property\s*(le?\s*li|li\s*hai|kha?ri?d\s*li)/i,
    /(flat|ghar|makan)\s*(le?\s*li|li\s*hai|le\s*liya|kha?ri?d\s*liya)/i,
];

// ─── Public API ───────────────────────────────────────────────────

/**
 * Run all rule passes, persist results to audit_reports, send digest + critical alerts.
 * Idempotent: writes one audit_reports row per call. Safe to run hourly or daily.
 */
export async function runBehaviorAudit(): Promise<AuditRunResult> {
    const startedAt = new Date();
    logger.info('[BehaviorAuditor] Starting audit run');

    const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000);

    const findings: Finding[] = [];
    findings.push(...await ruleR1_messagesToManagement(since));
    findings.push(...await ruleR2_freeFormToClosedSession(since));
    findings.push(...await ruleR3_duplicateExhausted(since));
    findings.push(...await ruleR4_inboundUnreplied(since));
    findings.push(...await ruleR5_newDealStuck());
    findings.push(...await ruleR6_qualifiedNoShare());
    findings.push(...await ruleR7_visitScheduledNoOutcome());
    findings.push(...await ruleR8_templateRepeated(since));
    findings.push(...await ruleR9_closingSignalIgnored(since));

    const counts_by_rule: Record<string, number> = {};
    const counts_by_severity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of findings) {
        counts_by_rule[f.rule_id] = (counts_by_rule[f.rule_id] || 0) + 1;
        counts_by_severity[f.severity]++;
    }

    const finishedAt = new Date();
    const result: AuditRunResult = {
        window_hours: WINDOW_HOURS,
        findings,
        counts_by_rule,
        counts_by_severity,
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
    };

    // Persist to audit_reports (uses existing schema, no migration needed).
    const totalConversations = await prisma.interaction.groupBy({
        by: ['phone_number'],
        where: { channel: 'whatsapp', created_at: { gte: since } },
    }).then(r => r.length).catch(() => 0);

    await prisma.auditReport.create({
        data: {
            report_date: finishedAt,
            total_conversations: totalConversations,
            total_flagged: findings.length,
            avg_quality_score: null,
            issues_found: findings as any,
            agent_breakdown: { source: 'behavior_auditor' } as any,
            sentiment_stats: counts_by_severity as any,
            actions_taken: counts_by_rule as any,
        },
    }).catch((err) => logger.error('[BehaviorAuditor] Failed to persist audit_report:', err));

    // 2026-05-19: behaviour-audit NO LONGER WhatsApps super_boss directly.
    // It only persists audit_reports; the consolidated owner_digest
    // (08:00 / 20:00 IST) reads the latest run and sends ONE message.
    // (notifyDigest/notifyCritical kept defined but intentionally unused —
    // removing odd-hour + per-finding spam per owner request.)
    void notifyDigest; void notifyCritical;

    logger.info(`[BehaviorAuditor] Run complete: ${findings.length} findings (${counts_by_severity.critical} critical, ${counts_by_severity.high} high)`);
    return result;
}

// ─── Rule Implementations ─────────────────────────────────────────

/**
 * R1 — Outbound WhatsApp to MANAGEMENT/PARTNER_AGENT contacts that came from the
 * automated FollowupScheduler (event_type='followup', metadata.trigger='scheduler').
 * These contacts should never be on the auto-followup list.
 */
async function ruleR1_messagesToManagement(since: Date): Promise<Finding[]> {
    const offenders = await prisma.$queryRaw<Array<{ phone_number: string; name: string | null; contact_type: string; count: bigint }>>`
        SELECT i.phone_number, c.name, c.contact_type::text as contact_type, COUNT(*)::bigint as count
        FROM interactions i
        JOIN contacts c ON c.phone_number = i.phone_number
        WHERE i.channel = 'whatsapp'
          AND i.direction = 'outbound'
          AND i.event_type = 'followup'
          AND i.created_at >= ${since}
          AND c.contact_type IN ('MANAGEMENT', 'PARTNER_AGENT')
          AND (i.metadata->>'trigger') = 'scheduler'
        GROUP BY i.phone_number, c.name, c.contact_type
    `;
    return offenders.map((o) => ({
        rule_id: 'R1',
        rule_name: 'AI follow-up sent to MANAGEMENT/PARTNER_AGENT',
        severity: 'high' as Severity,
        contact_phone: o.phone_number,
        contact_name: o.name,
        evidence: `${o.count} auto-followup msg(s) sent to ${o.contact_type} contact in last ${WINDOW_HOURS}h`,
        suggested_fix: 'Verify FollowupScheduler contact_type filter is BUYER/TENANT/LANDLORD only',
        detected_at: new Date().toISOString(),
    }));
}

/**
 * R2 — Free-form (non-template) outbound messages sent when 24h WA window is closed.
 * Detected by: outbound message with event_type IN ('followup','message') AND metadata
 * lacks templateName AND contact has no inbound in last 24h.
 */
async function ruleR2_freeFormToClosedSession(since: Date): Promise<Finding[]> {
    const offenders = await prisma.$queryRaw<Array<{ phone_number: string; name: string | null; count: bigint }>>`
        SELECT i.phone_number, c.name, COUNT(*)::bigint as count
        FROM interactions i
        JOIN contacts c ON c.phone_number = i.phone_number
        WHERE i.channel = 'whatsapp'
          AND i.direction = 'outbound'
          AND i.event_type IN ('followup', 'message')
          AND i.created_at >= ${since}
          AND (i.metadata->>'templateName') IS NULL
          AND (c.last_wa_inbound IS NULL OR c.last_wa_inbound < (i.created_at - INTERVAL '24 hours'))
        GROUP BY i.phone_number, c.name
    `;
    return offenders.map((o) => ({
        rule_id: 'R2',
        rule_name: 'Free-form WA sent outside 24h window (Meta will reject)',
        severity: 'high' as Severity,
        contact_phone: o.phone_number,
        contact_name: o.name,
        evidence: `${o.count} free-form msg(s) sent to closed session in last ${WINDOW_HOURS}h`,
        suggested_fix: 'Use template message via PendingMessageQueue.queueAndReopen() instead of sendText',
        detected_at: new Date().toISOString(),
    }));
}

/**
 * R3 — `property_share_exhausted` interaction logged 2+ times for the same deal_id
 * within a 5-minute window. Indicates a dedup race.
 */
async function ruleR3_duplicateExhausted(since: Date): Promise<Finding[]> {
    const dupes = await prisma.$queryRaw<Array<{ deal_id: string; phone_number: string; count: bigint; first_at: Date; last_at: Date }>>`
        SELECT
            (i.metadata->>'deal_id')::text as deal_id,
            i.phone_number,
            COUNT(*)::bigint as count,
            MIN(i.created_at) as first_at,
            MAX(i.created_at) as last_at
        FROM interactions i
        WHERE i.event_type = 'property_share_exhausted'
          AND i.created_at >= ${since}
        GROUP BY (i.metadata->>'deal_id'), i.phone_number
        HAVING COUNT(*) >= 2
           AND EXTRACT(EPOCH FROM (MAX(i.created_at) - MIN(i.created_at))) <= 300
    `;
    return dupes.map((d) => ({
        rule_id: 'R3',
        rule_name: 'property_share_exhausted fired multiple times for same deal',
        severity: 'medium' as Severity,
        deal_id: d.deal_id,
        contact_phone: d.phone_number,
        evidence: `${d.count} exhausted notifications within 5min for deal ${d.deal_id?.substring(0, 8)}`,
        suggested_fix: 'Confirm 5min dedup guard in property_sharing.ts is active',
        detected_at: new Date().toISOString(),
    }));
}

/**
 * R4 — Inbound WA message from a BUYER/TENANT got NO outbound reply within
 * REPLY_SLA_MINUTES, during business hours (8 AM – 9 PM IST).
 */
async function ruleR4_inboundUnreplied(since: Date): Promise<Finding[]> {
    const slaMs = REPLY_SLA_MINUTES * 60 * 1000;

    const inbound = await prisma.$queryRaw<Array<{
        id: string; phone_number: string; name: string | null; content: string | null; created_at: Date;
    }>>`
        SELECT i.id, i.phone_number, c.name, i.content, i.created_at
        FROM interactions i
        JOIN contacts c ON c.phone_number = i.phone_number
        WHERE i.channel = 'whatsapp'
          AND i.direction = 'inbound'
          AND i.event_type IN ('message', 'buyer_workflow_message', 'workflow_message')
          AND i.created_at >= ${since}
          AND c.contact_type IN ('BUYER', 'TENANT', 'UNKNOWN')
        ORDER BY i.created_at DESC
        LIMIT 200
    `;

    const findings: Finding[] = [];
    for (const msg of inbound) {
        if (!isBusinessHoursIST(msg.created_at)) continue;

        const reply = await prisma.interaction.findFirst({
            where: {
                phone_number: msg.phone_number,
                channel: 'whatsapp',
                direction: 'outbound',
                created_at: {
                    gte: msg.created_at,
                    lte: new Date(msg.created_at.getTime() + slaMs),
                },
            },
            select: { id: true },
        });

        if (!reply) {
            findings.push({
                rule_id: 'R4',
                rule_name: `Inbound unreplied >${REPLY_SLA_MINUTES}min (business hours)`,
                severity: 'critical',
                contact_phone: msg.phone_number,
                contact_name: msg.name,
                evidence: `Lead said "${(msg.content || '').slice(0, 80)}" at ${msg.created_at.toISOString()}, no bot reply`,
                suggested_fix: 'Trace message_router → agent.handle for this contact; check classifier returned non-empty reply_script',
                detected_at: new Date().toISOString(),
            });
        }
    }
    return findings;
}

/** R5 — Deal in NEW status for more than STAGE_NEW_MAX_HOURS. Call cadence stuck. */
async function ruleR5_newDealStuck(): Promise<Finding[]> {
    const cutoff = new Date(Date.now() - STAGE_NEW_MAX_HOURS * 60 * 60 * 1000);
    const stuck = await prisma.transaction.findMany({
        where: {
            status: TransactionStatus.NEW,
            created_at: { lt: cutoff },
            ai_paused: false,
        },
        include: {
            demand_contact: { select: { phone_number: true, name: true } },
        },
        take: 50,
    });
    return stuck.map((d) => ({
        rule_id: 'R5',
        rule_name: `Deal stuck in NEW > ${STAGE_NEW_MAX_HOURS}h`,
        severity: 'high' as Severity,
        deal_id: d.id,
        contact_phone: d.demand_contact?.phone_number || null,
        contact_name: d.demand_contact?.name || null,
        evidence: `Deal created ${Math.round((Date.now() - d.created_at.getTime()) / (1000 * 60 * 60))}h ago, still NEW`,
        suggested_fix: 'Check qualification call cadence; with Omnidim absent, fallback template should fire on attempt 1',
        detected_at: new Date().toISOString(),
    }));
}

/** R6 — Deal in QUALIFIED for more than STAGE_QUALIFIED_MAX_DAYS with no property_shared. */
async function ruleR6_qualifiedNoShare(): Promise<Finding[]> {
    const cutoff = new Date(Date.now() - STAGE_QUALIFIED_MAX_DAYS * 24 * 60 * 60 * 1000);
    const stale = await prisma.transaction.findMany({
        where: {
            status: TransactionStatus.QUALIFIED,
            updated_at: { lt: cutoff },
            ai_paused: false,
        },
        include: {
            demand_contact: { select: { phone_number: true, name: true } },
        },
        take: 50,
    });

    const findings: Finding[] = [];
    for (const d of stale) {
        const shared = await prisma.interaction.findFirst({
            where: {
                event_type: 'property_shared',
                metadata: { path: ['deal_id'], equals: d.id },
            },
            select: { id: true },
        });
        if (!shared) {
            findings.push({
                rule_id: 'R6',
                rule_name: `Deal QUALIFIED > ${STAGE_QUALIFIED_MAX_DAYS}d with no property_shared`,
                severity: 'medium',
                deal_id: d.id,
                contact_phone: d.demand_contact?.phone_number || null,
                contact_name: d.demand_contact?.name || null,
                evidence: `Deal qualified ${Math.round((Date.now() - d.updated_at.getTime()) / (1000 * 60 * 60 * 24))}d ago, no property cards sent`,
                suggested_fix: 'Check matching engine for this deal; verify inventory exists matching demand criteria',
                detected_at: new Date().toISOString(),
            });
        }
    }
    return findings;
}

/** R7 — VISIT_SCHEDULED past expected visit date+24h with no outcome submitted. */
async function ruleR7_visitScheduledNoOutcome(): Promise<Finding[]> {
    const overdue = await prisma.transaction.findMany({
        where: {
            status: TransactionStatus.VISIT_SCHEDULED,
            updated_at: { lt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
            visit_outcome: null,
        },
        include: {
            demand_contact: { select: { phone_number: true, name: true } },
        },
        take: 50,
    });
    return overdue.map((d) => ({
        rule_id: 'R7',
        rule_name: 'VISIT_SCHEDULED > 48h with no outcome',
        severity: 'high' as Severity,
        deal_id: d.id,
        contact_phone: d.demand_contact?.phone_number || null,
        contact_name: d.demand_contact?.name || null,
        evidence: `Visit scheduled ${Math.round((Date.now() - d.updated_at.getTime()) / (1000 * 60 * 60))}h ago, no outcome submitted`,
        suggested_fix: 'Lead manager must submit visit outcome via /api/deals/:id/visit-outcome',
        detected_at: new Date().toISOString(),
    }));
}

/** R8 — Same template name fired TEMPLATE_REPEAT_LIMIT+ times to same contact in window. */
async function ruleR8_templateRepeated(since: Date): Promise<Finding[]> {
    const offenders = await prisma.$queryRaw<Array<{ phone_number: string; name: string | null; template: string; count: bigint }>>`
        SELECT i.phone_number, c.name, (i.metadata->>'templateName') as template, COUNT(*)::bigint as count
        FROM interactions i
        JOIN contacts c ON c.phone_number = i.phone_number
        WHERE i.channel = 'whatsapp'
          AND i.direction = 'outbound'
          AND i.created_at >= ${since}
          AND (i.metadata->>'templateName') IS NOT NULL
        GROUP BY i.phone_number, c.name, (i.metadata->>'templateName')
        HAVING COUNT(*) >= ${TEMPLATE_REPEAT_LIMIT}
    `;
    return offenders.map((o) => ({
        rule_id: 'R8',
        rule_name: `Same template fired ${TEMPLATE_REPEAT_LIMIT}+ times to one contact`,
        severity: 'medium' as Severity,
        contact_phone: o.phone_number,
        contact_name: o.name,
        evidence: `Template "${o.template}" fired ${o.count} times in ${WINDOW_HOURS}h`,
        suggested_fix: 'Add per-template per-contact dedup window or reduce trigger frequency',
        detected_at: new Date().toISOString(),
    }));
}

/**
 * R9 — Inbound message from BUYER/TENANT contained a closing signal
 * ("humne le li", "not interested", etc.) but no `closing_signal` event was logged
 * in the next 60 seconds. Means webhook_processor.ts didn't catch the regex.
 */
async function ruleR9_closingSignalIgnored(since: Date): Promise<Finding[]> {
    const inbound = await prisma.$queryRaw<Array<{
        id: string; phone_number: string; name: string | null; content: string; created_at: Date;
    }>>`
        SELECT i.id, i.phone_number, c.name, i.content, i.created_at
        FROM interactions i
        JOIN contacts c ON c.phone_number = i.phone_number
        WHERE i.channel = 'whatsapp'
          AND i.direction = 'inbound'
          AND i.event_type IN ('message', 'buyer_workflow_message')
          AND i.created_at >= ${since}
          AND c.contact_type IN ('BUYER', 'TENANT')
          AND i.content IS NOT NULL
        ORDER BY i.created_at DESC
        LIMIT 500
    `;

    const findings: Finding[] = [];
    for (const msg of inbound) {
        if (!CLOSING_SIGNAL_PATTERNS.some((re) => re.test(msg.content))) continue;

        const captured = await prisma.interaction.findFirst({
            where: {
                phone_number: msg.phone_number,
                event_type: 'closing_signal',
                created_at: {
                    gte: msg.created_at,
                    lte: new Date(msg.created_at.getTime() + 60 * 1000),
                },
            },
            select: { id: true },
        });
        if (!captured) {
            findings.push({
                rule_id: 'R9',
                rule_name: 'Closing signal in inbound message but bot did not catch it',
                severity: 'critical',
                contact_phone: msg.phone_number,
                contact_name: msg.name,
                evidence: `Lead said "${msg.content.slice(0, 80)}" — no closing_signal event logged`,
                suggested_fix: 'Add this phrase to CLOSING_SIGNAL_PATTERNS in webhook_processor.ts (and behavior_auditor.ts)',
                detected_at: new Date().toISOString(),
            });
        }
    }
    return findings;
}

// ─── Notification ─────────────────────────────────────────────────

const SUPER_BOSS_PHONES_CACHE: { phones: string[]; expiresAt: number } = { phones: [], expiresAt: 0 };

async function getSuperBossPhones(): Promise<string[]> {
    if (Date.now() < SUPER_BOSS_PHONES_CACHE.expiresAt) return SUPER_BOSS_PHONES_CACHE.phones;
    const agents = await prisma.agent.findMany({
        where: { role: 'super_boss', status: 'active' },
        select: { phone: true },
    }).catch(() => [] as { phone: string | null }[]);
    const phones = agents.map((a) => a.phone).filter((p): p is string => Boolean(p));
    SUPER_BOSS_PHONES_CACHE.phones = phones;
    SUPER_BOSS_PHONES_CACHE.expiresAt = Date.now() + 60 * 60 * 1000;
    return phones;
}

async function notifyDigest(result: AuditRunResult): Promise<void> {
    if (result.findings.length === 0) {
        logger.info('[BehaviorAuditor] No findings — skipping digest');
        return;
    }

    const phones = await getSuperBossPhones();
    if (phones.length === 0) {
        logger.warn('[BehaviorAuditor] No super_boss agents found — skipping digest');
        return;
    }

    const summary = formatDigest(result);
    for (const phone of phones) {
        try {
            await whatsapp.sendText(phone, summary);
        } catch (err) {
            logger.warn(`[BehaviorAuditor] Digest send failed for ${phone}: ${(err as Error).message}`);
        }
    }
    logger.info(`[BehaviorAuditor] Digest sent to ${phones.length} super_boss agents`);
}

async function notifyCritical(result: AuditRunResult): Promise<void> {
    const critical = result.findings.filter((f) => f.severity === 'critical');
    if (critical.length === 0) return;

    const phones = await getSuperBossPhones();
    if (phones.length === 0) return;

    const lines: string[] = [];
    lines.push(`🚨 *Panditji Audit — CRITICAL findings*`);
    lines.push(``);
    for (const f of critical.slice(0, 10)) {
        lines.push(`• [${f.rule_id}] ${f.rule_name}`);
        if (f.contact_name || f.contact_phone) {
            lines.push(`  ${f.contact_name || 'unknown'} (${f.contact_phone || '?'})`);
        }
        lines.push(`  ${f.evidence}`);
        lines.push(``);
    }
    if (critical.length > 10) lines.push(`...and ${critical.length - 10} more.`);
    lines.push(`Reply STOP to mute alerts for 4h.`);
    const body = lines.join('\n');

    for (const phone of phones) {
        try {
            await whatsapp.sendText(phone, body);
        } catch (err) {
            logger.warn(`[BehaviorAuditor] Critical alert send failed for ${phone}: ${(err as Error).message}`);
        }
    }
}

function formatDigest(result: AuditRunResult): string {
    const c = result.counts_by_severity;
    const r = result.counts_by_rule;
    const lines: string[] = [];
    lines.push(`🤖 *Panditji Daily Audit — ${new Date().toLocaleDateString('en-IN')}*`);
    lines.push(``);
    lines.push(`Window: last ${result.window_hours}h`);
    lines.push(`Findings: ${result.findings.length}  (🔴 ${c.critical} critical, 🟠 ${c.high} high, 🟡 ${c.medium} medium, 🟢 ${c.low} low)`);
    lines.push(``);

    if (result.findings.length === 0) {
        lines.push(`✅ All clear. Bot behavior healthy.`);
        return lines.join('\n');
    }

    lines.push(`*Per rule:*`);
    for (const [ruleId, count] of Object.entries(r).sort((a, b) => b[1] - a[1])) {
        const sample = result.findings.find((f) => f.rule_id === ruleId);
        lines.push(`• ${ruleId} — ${sample?.rule_name || '?'}: ${count}`);
    }
    lines.push(``);

    if (c.critical > 0 || c.high > 0) {
        lines.push(`*Top items:*`);
        const top = result.findings
            .filter((f) => f.severity === 'critical' || f.severity === 'high')
            .slice(0, 5);
        for (const f of top) {
            lines.push(`• [${f.rule_id}] ${f.contact_name || f.contact_phone || f.deal_id?.substring(0, 8) || 'system'} — ${f.evidence}`);
        }
        lines.push(``);
    }

    lines.push(`Full report in admin → AI Audit tab.`);
    return lines.join('\n');
}

// ─── Helpers ──────────────────────────────────────────────────────

function isBusinessHoursIST(d: Date): boolean {
    const istMs = d.getTime() + IST_OFFSET_MINUTES * 60 * 1000;
    const istHour = new Date(istMs).getUTCHours();
    return istHour >= BUSINESS_START_IST && istHour < BUSINESS_END_IST;
}
