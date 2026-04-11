/**
 * ensureOwner — Shared utility to find-or-create an Owner record.
 *
 * Every inventory creation path needs an owner_id (non-nullable FK).
 * This utility ensures one exists for the given phone number.
 */

import prisma from '../db';
import logger from '../utils/logger';
import { normalizePhone, phoneVariants } from '../utils/phone';

/**
 * Find or create an Owner for the given phone number.
 * Returns the owner_id (string).
 *
 * If Owner already exists → returns existing id.
 * If not → creates Contact (if needed) + Owner + FREE Subscription atomically.
 */
export async function ensureOwner(phone: string, tenantId: string): Promise<string> {
    const normalized = normalizePhone(phone);

    // 1. Check if Owner already exists (check all phone variants)
    const existing = await prisma.owner.findFirst({
        where: { contact_phone: { in: phoneVariants(normalized) } },
    });

    if (existing) {
        return existing.id;
    }

    // 2. Create Contact + Owner + Subscription in transaction
    const result = await prisma.$transaction(async (tx) => {
        // Upsert contact
        await tx.contact.upsert({
            where: { phone_number: normalized },
            create: {
                phone_number: normalized,
                tenant_id: tenantId,
                name: 'Unknown',
                source: 'system',
                contact_type: 'SELLER_LANDLORD',
            },
            update: {},
        });

        // Create Owner
        const owner = await tx.owner.create({
            data: {
                scope: 'INTERNAL',
                contact_phone: normalized,
                status: 'ACTIVE',
                listing_limit: 10,
                priority_score: 50,
            },
        });

        // Create FREE subscription
        await tx.subscription.create({
            data: {
                owner_id: owner.id,
                plan_type: 'FREE',
                status: 'ACTIVE',
                start_date: new Date(),
                auto_renew: false,
            },
        });

        logger.info(`[ensureOwner] Created owner ${owner.id} for ${phone}`);
        return owner;
    });

    return result.id;
}
