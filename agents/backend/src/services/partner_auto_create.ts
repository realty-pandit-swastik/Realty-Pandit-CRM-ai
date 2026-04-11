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
    managingAgentId: string
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

    // Create minimal Contact record (SSOT — phone is PK)
    await prisma.contact.upsert({
        where: { phone_number: normalizedPhone },
        update: {
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

    // Create minimal PartnerAgent record — status PENDING_PAYMENT (not verified, not onboarded)
    const partner = await prisma.partnerAgent.create({
        data: {
            phone_number: normalizedPhone,
            name: name || 'Partner Agent',
            partner_category: 'INDIVIDUAL',
            business_name: name || 'Pending Registration',
            business_address: 'Pending',
            status: 'PENDING_PAYMENT',
            verified: false,
            package_type: 'FREE',
            partner_type: 'HAS_BUYERS',
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
