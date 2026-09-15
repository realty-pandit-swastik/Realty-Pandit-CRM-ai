import prisma from '../db';
import { phoneVariants } from '../utils/phone';

export type ShareMode = 'direct' | 'dealer';

export interface ShareModeResult {
    mode: ShareMode;
    partner: { phone_number: string; name: string } | null;
}

/**
 * Recognize an inventory-share recipient by phone.
 *
 * An ACTIVE PartnerAgent (the table where every dealer/partner we onboard is
 * stored — phone_number is @unique) → 'dealer' → brand-free brochure PDF, which
 * they can forward to their own buyer with no Realty Pandit trace (protects the
 * partner's commission). Anyone else → 'direct' → the existing v5 property card.
 *
 * The decision lives server-side ONLY — it must never be a frontend toggle.
 */
export async function resolveShareMode(phone: string): Promise<ShareModeResult> {
    const variants = phoneVariants(phone);
    const partner = await prisma.partnerAgent.findFirst({
        where: { phone_number: { in: variants }, status: 'ACTIVE' },
        select: { phone_number: true, name: true },
    });
    return partner ? { mode: 'dealer', partner } : { mode: 'direct', partner: null };
}
