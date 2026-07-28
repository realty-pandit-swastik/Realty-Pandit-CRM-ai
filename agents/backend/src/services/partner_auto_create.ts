/**
 * Partner Auto-Create Utility
 * When a lead is logged as PARTNER_REFERRAL and the referring partner is not registered,
 * this creates a minimal PartnerAgent record (status: PENDING_PAYMENT) so the link is preserved.
 * The partner can be fully onboarded later via the admin panel.
 */

import prisma from '../db';
import logger from '../utils/logger';
import { normalizePhone } from '../utils/phone';

export interface PartnerAutoCreateResult {
    partnerId: string;
    wasCreated: boolean;
    partnerPhone: string;
}

/**
 * Ensure a PartnerAgent record exists for the given phone number.
 * - If already registered: returns existing record (wasCreated = false)
 * - If not registered: creates minimal Contact + PartnerAgent with PENDING_PAYMENT status
 *
 * Caller is responsible for firing partner notifications non-blocking after this returns.
 */
export async function ensurePartnerAgent(
    phone: string,
    name: string,
    tenantId: string,
    managingAgentId: string,
    options?: { partnerCategory?: 'INDIVIDUAL' | 'COMPANY'; companyName?: string | null }
): Promise<PartnerAutoCreateResult> {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
        throw new Error(`Invalid partner phone number: ${phone}`);
    }

    // Check if PartnerAgent already exists
    const existing = await prisma.partnerAgent.findUnique({
        where: { phone_number: normalizedPhone },
        select: { id: true },
    });

    if (existing) {
        logger.info(`[PartnerAutoCreate] Partner already exists: ${normalizedPhone}`);
        return { partnerId: existing.id, wasCreated: false, partnerPhone: normalizedPhone };
    }

    // 2026-07-28: never DOWNGRADE a live demand lead (BUYER/TENANT) to PARTNER_AGENT — that silently
    // hid real leads from the Leads list. Only set PARTNER_AGENT on create or for non-demand contacts.
    const _existingC = await prisma.contact.findUnique({ where: { phone_number: normalizedPhone }, select: { contact_type: true } });
    const _keepDemand = !!_existingC && ['BUYER', 'TENANT'].includes(_existingC.contact_type as string);
    if (_keepDemand) logger.warn(`[PartnerAutoCreate] ${normalizedPhone} is a live ${_existingC!.contact_type} lead — NOT downgrading to PARTNER_AGENT`);
    // Create minimal Contact record (SSOT — phone is PK)
    await prisma.contact.upsert({
        where: { phone_number: normalizedPhone },
        update: _keepDemand ? {} : {
            contact_type: 'PARTNER_AGENT',
        },
        create: {
            phone_number: normalizedPhone,
            tenant_id: tenantId,
            name: name || 'Partner Agent',
            contact_type: 'PARTNER_AGENT',
            source: 'auto_created',
            lead_status: 'cold',
            lifecycle_stage: 'NEW',
        },
    });

    // 2026-05-15: Business model is commission-on-sale (no subscription). Partners
    // are immediately ACTIVE — no payment gate. listing_limit is effectively unlimited.
    // Optional fields (business_name, business_address) left null; admin or the partner
    // can fill them later via the Partner Agents page.
    const partner = await prisma.partnerAgent.create({
        data: {
            phone_number: normalizedPhone,
            name: name || 'Partner Agent',
            partner_category: options?.partnerCategory ?? 'INDIVIDUAL',
            business_name: options?.companyName ?? null,
            business_address: null,
            status: 'ACTIVE',
            verified: false,
            package_type: 'FREE',
            listing_limit: 99999,
            partner_type: 'BOTH',
            managing_agent_id: managingAgentId,
            onboarded_by_agent_id: managingAgentId,
            onboarded_at: new Date(),
        },
    });

    // Log the auto-creation as an interaction
    await prisma.interaction.create({
        data: {
            tenant_id: tenantId,
            phone_number: normalizedPhone,
            channel: 'admin',
            direction: 'outbound',
            event_type: 'partner_auto_created',
            content: `Partner auto-created by agent ${managingAgentId} via lead referral entry`,
        },
    });

    logger.info(`[PartnerAutoCreate] Auto-created partner: ${normalizedPhone} (${partner.id})`);
    return { partnerId: partner.id, wasCreated: true, partnerPhone: normalizedPhone };
}
