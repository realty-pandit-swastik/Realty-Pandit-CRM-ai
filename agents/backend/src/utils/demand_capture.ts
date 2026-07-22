/**
 * Persist the residential-vs-commercial CATEGORY a chat/voice lead implies from their stated
 * property type, so the matching engine separates commercial from residential.
 *
 * Why this exists: property_sharing (the AI auto-share matcher) builds its match criteria from the
 * CONTACT's `category_id` / `sub_category_id` / `demand_taxonomy_node_id` — NOT from a property_type
 * string (see property_sharing.ts ~L181-184, which hardcodes demand_type_slug:null and reads the
 * contact's classification ids). The WhatsApp chat path captured `contact.property_type` (a string)
 * but never resolved it into the canonical classification, so a "shop"/"office" buyer was matched
 * against residential stock. The portal paths (99acres / MagicBricks / website / buyer-workflow)
 * already call resolveDemandTaxonomy on capture — this brings the WhatsApp chat path in line.
 *
 * Conservative by design: stores only the coarse `category_id` (residential vs commercial), NOT
 * sub_category_id / node — so it separates the two worlds without over-narrowing INSIDE residential
 * (a 2BHK seeker still sees flats + builder floors, not apartment-only). Idempotent: skips the write
 * when the category is unchanged. Never throws — capture must not break the reply path.
 */
import prisma from '../db';
import logger from './logger';
import { resolveDemandTaxonomy } from './demand_taxonomy';

export async function applyDemandCategoryFromType(
    phone: string,
    propertyType: string | null | undefined,
): Promise<void> {
    const pt = propertyType?.trim();
    if (!pt) return;
    try {
        const tax = await resolveDemandTaxonomy({ property_type: pt });
        if (!tax.category_id) return;
        const cur = await prisma.contact.findUnique({
            where: { phone_number: phone },
            select: { category_id: true },
        });
        if (cur?.category_id === tax.category_id) return; // no-op if unchanged
        await prisma.contact.update({
            where: { phone_number: phone },
            data: { category_id: tax.category_id },
        });
        logger.info(`[DemandCapture] "${pt}" → category_id=${tax.category_id} for ${phone} (residential/commercial separation)`);
    } catch (e) {
        logger.warn(`[DemandCapture] applyDemandCategoryFromType failed for ${phone} ("${pt}"): ${(e as Error).message}`);
    }
}
