import prisma from '../db';
import { Prisma } from '@prisma/client';
import { normalizePhone, phoneVariants } from '../utils/phone';
import { generateDisplayId } from '../utils/inventory_id';
import { resolveDemandTaxonomy } from '../utils/demand_taxonomy';
import { normalizePriceToRupees } from '../utils/inventory_math';
import { absurdPriceError } from '../utils/price_sanity';
import { z } from 'zod';

export const harvestSchema = z.object({
    source: z.enum(['99acres', 'magicbricks', 'housing', 'classifieds', 'portal_crawl']),
    source_ref: z.string().trim().min(1).max(1000),
    source_url: z.string().url().max(2000).optional(),
    seller_name: z.string().max(200).optional(), seller_phone: z.string().max(50).optional(),
    seller_email: z.string().email().optional(), property_title: z.string().max(500).optional(),
    property_type: z.string().max(100).optional(), intent: z.enum(['sell', 'rent', 'lease', 'rent_lease']).default('sell'),
    price: z.coerce.number().finite().nonnegative().optional(),
    price_unit: z.enum(['rupees', 'INR', 'Lakh', 'lakh', 'lacs', 'lac', 'Crore', 'crore', 'Cr', 'cr']).optional(),
    city: z.string().trim().min(1).max(200).optional(), locality: z.string().max(200).optional(),
    society_name: z.string().max(200).optional(), full_address: z.string().max(1000).optional(),
    description: z.string().max(20000).optional(),
    specs: z.record(z.string(), z.unknown()).default({}), features: z.record(z.string(), z.unknown()).optional(),
    media_urls: z.array(z.string().url()).max(100).default([]),
});
export class HarvestError extends Error { constructor(public status: number, message: string) { super(message); } }

/** All business writes share the transaction. Locks cover BOTH external identity and global phone identity. */
export async function ingestPortalListing(input: unknown, actor: { tenant_id: string; id: string }) {
    const parsed = harvestSchema.safeParse(input);
    if (!parsed.success) throw new HarvestError(400, parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
    if (!actor.tenant_id || !actor.id) throw new HarvestError(403, 'Tenant and assigned staff are required');
    const data = parsed.data;
    const phone = data.seller_phone ? normalizePhone(data.seller_phone) : '';
    if (data.seller_phone && !phone) throw new HarvestError(400, 'Invalid seller_phone');
    const payload = { ...data, seller_phone: phone || undefined };
    // JSON serialization removes optional undefined values before the Prisma JSON boundary.
    const storedPayload = JSON.parse(JSON.stringify({ ...payload, _ingested_by: actor.id })) as Prisma.InputJsonObject;
    const type = String(data.property_type || '').toLowerCase().replace(/\s+/g, '_');
    const category = /office|retail|commercial|shop|warehouse/.test(type) ? 'commercial' : /agricultur/.test(type) ? 'agricultural' : 'residential';
    const specs = { ...data.features, ...data.specs } as Record<string, any>;
    if (specs.bedrooms != null && specs.bhk == null) specs.bhk = specs.bedrooms;
    if (specs.rooms != null && specs.bhk == null) specs.bhk = specs.rooms;
    if (specs.bhk != null) { const bhk = Number(String(specs.bhk).replace(/\s*bhk$/i, '')); if (Number.isFinite(bhk) && bhk > 0) specs.bhk = bhk; }
    const price = normalizePriceToRupees(data.price, data.price_unit);
    const priceError = absurdPriceError(price, type);
    if (priceError) throw new HarvestError(400, priceError);
    // Candidate-only ingestion needs no taxonomy or fabricated seller identity.
    const taxonomy = phone ? await resolveDemandTaxonomy({ main_category: category, property_type: type, bhk: specs.bhk, amenities: specs.amenities, furnishing: specs.furnishing, facing: specs.facing }) : null;
    const identity = { tenant_id: actor.tenant_id, source: data.source, external_id: data.source_ref };
    return prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(identity)}, 0))`;
        let candidate = await tx.portalListing.findUnique({ where: { tenant_id_source_external_id: identity } });
        if (candidate?.inventory_id || (candidate && !phone)) {
            await tx.portalListing.update({ where: { id: candidate.id }, data: { last_seen_at: new Date(), ...(!candidate.inventory_id ? { payload: { ...storedPayload, _ingested_by: (candidate.payload as any)?._ingested_by || actor.id }, source_url: data.source_url } : {}) } });
            const inventory = candidate.inventory_id ? await tx.inventory.findUnique({ where: { id: candidate.inventory_id }, select: { id: true, display_id: true } }) : null;
            return { success: true, duplicate: true, candidate_id: candidate.id, inventory_id: inventory?.id, display_id: inventory?.display_id, status: candidate.status };
        }
        if (!candidate) candidate = await tx.portalListing.create({ data: { ...identity, source_url: data.source_url, payload: storedPayload } });
        if (!phone) return { success: true, duplicate: false, candidate_id: candidate.id, status: 'CANDIDATE' };
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${phone}, 0))`;
        const variants = phoneVariants(phone);
        let contact = await tx.contact.findFirst({ where: { phone_number: { in: variants } } });
        if (contact && contact.tenant_id !== actor.tenant_id) throw new HarvestError(409, 'Seller identity is unavailable in this tenant');
        const staff = await tx.agent.findFirst({ where: { phone: { in: variants }, status: 'active' }, select: { id: true } });
        if (staff) throw new HarvestError(400, 'A staff phone cannot be a property owner');
        if (!contact) contact = await tx.contact.create({ data: {
            tenant_id: actor.tenant_id, phone_number: phone, name: data.seller_name || null,
            email: data.seller_email || null, contact_type: 'LANDLORD', source: data.source,
            last_channel: data.source, assigned_agent_id: actor.id, verification_status: 'UNVERIFIED',
        } });
        let owner = await tx.owner.findUnique({ where: { contact_phone: contact.phone_number } });
        if (!owner) owner = await tx.owner.create({ data: { scope: 'INTERNAL', contact_phone: contact.phone_number, status: 'PENDING_VERIFICATION' } });
        const displayId = await generateDisplayId(data.city || '', category);
        const inventory = await tx.inventory.create({ data: {
            tenant_id: actor.tenant_id, owner_id: owner.id, owner_phone: contact.phone_number,
            owner_contact_id: contact.phone_number, ownership_type: 'OWNER',
            assigned_agent_id: actor.id, uploaded_by_agent_id: actor.id, display_id: displayId,
            upload_source: 'portal_crawl', status: 'pending_approval', category, type: type || 'unknown', intent: data.intent,
            category_id: taxonomy?.category_id, sub_category_id: taxonomy?.sub_category_id, type_id: taxonomy?.type_id,
            taxonomy_node_id: taxonomy?.demand_taxonomy_node_id, needs_taxonomy_review: !taxonomy?.demand_taxonomy_node_id || taxonomy.needs_review,
            price, price_unit: 'INR', customer_price: price, display_price: price,
            city: data.city || null, locality: data.locality || null, apartment_name: data.society_name || null,
            full_address: data.full_address || [data.society_name, data.locality, data.city].filter(Boolean).join(', ') || null,
            specs: { ...taxonomy?.demand_schema_values, ...specs } as Prisma.InputJsonObject,
            description: data.description || null, media_urls: data.media_urls, video_urls: [],
            lead_reference: `HARVESTED_${data.source.toUpperCase()}:${data.source_ref}`,
        } });
        const task = await tx.task.create({ data: {
            title: `Call owner to verify harvested listing: ${data.property_title || displayId}`,
            description: `Public listing from ${data.source}. Human owner call required before approval or automated outreach.`,
            assigned_to: actor.id, contact_phone: contact.phone_number, property_id: inventory.id,
            due_date: new Date(Date.now() + 86400000), priority: 'HIGH', status: 'TODO', tags: ['portal-sourcing', 'owner-verification'],
            task_type: 'PORTAL_HARVEST_VERIFICATION', stage_metadata: { tenant_id: actor.tenant_id, candidate_id: candidate.id, source: data.source, source_ref: data.source_ref },
        } });
        await tx.portalListing.update({ where: { id: candidate.id }, data: { inventory_id: inventory.id, verification_task_id: task.id, status: 'PENDING_VERIFICATION', payload: storedPayload, last_seen_at: new Date() } });
        return { success: true, duplicate: false, inventory_id: inventory.id, display_id: inventory.display_id, contact_id: contact.id, candidate_id: candidate.id, status: 'PENDING_VERIFICATION' };
    }, { timeout: 30000 });
}

/** Generic OTP verification does not authorize automated harvested-owner outreach. */
export async function harvestedOwnerOutreachAllowed(tenantId: string, phone: string): Promise<boolean> {
    const pending = await prisma.portalListing.findFirst({ where: { tenant_id: tenantId, owner_call_verified_at: null, payload: { path: ['seller_phone'], equals: normalizePhone(phone) } }, select: { id: true } });
    return !pending;
}
