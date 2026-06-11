/**
 * Lead Auto-Engage Service
 *
 * Handles automatic AI engagement based on lead source:
 *
 * Template A: External portal leads (99acres, MagicBricks, Housing)
 *   → Acknowledge source, ask missing info, qualify
 *
 * Template B: Fresh WhatsApp / Website leads
 *   → Full qualification flow (handled by buyer workflow)
 *
 * Template C: Internal team member created leads (already qualified)
 *   → Greeting + show properties immediately
 *
 * Also handles:
 *   - Lead record creation for external leads → assign to super admin
 *   - AI lock check (don't override if team member edited)
 *   - Dealer registration notification
 */

import prisma from '../db';
import { WhatsAppService } from './whatsapp';
import { SessionTracker } from './session_tracker';
import logger from '../utils/logger';

const whatsappService = new WhatsAppService();
const WEBSITE_URL = process.env.WEBSITE_URL || 'https://realtypandit.in';

/**
 * Check if AI should modify this contact's data.
 * Returns false if a team member has already verified/edited the lead.
 */
export async function isAILocked(phone: string): Promise<boolean> {
    const contact = await prisma.contact.findUnique({
        where: { phone_number: phone },
        select: { verified_by: true, verified_at: true },
    });
    // If verified_by is set, a team member has taken ownership — AI should not override
    return !!(contact?.verified_by);
}

/**
 * Save qualification data to contact record in real-time.
 * Respects AI lock — skips if team member has already edited.
 */
export async function saveQualificationData(
    phone: string,
    data: Record<string, any>,
): Promise<void> {
    const locked = await isAILocked(phone);
    if (locked) {
        logger.info(`[LeadAutoEngage] AI locked for ${phone} — team member has verified, skipping update`);
        return;
    }

    try {
        await prisma.contact.update({
            where: { phone_number: phone },
            data: {
                ...data,
                updated_at: new Date(),
            },
        });
        logger.info(`[LeadAutoEngage] Qualification data saved for ${phone}: ${Object.keys(data).join(', ')}`);
    } catch (err) {
        logger.warn(`[LeadAutoEngage] Failed to save qualification for ${phone}: ${(err as Error).message}`);
    }
}

/**
 * Create a Lead record for an external lead and assign to super admin.
 * Called when a new lead arrives from WhatsApp, website, or portals.
 */
export async function createExternalLeadRecord(phone: string, source: string): Promise<void> {
    try {
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return;

        // Check if lead already exists for this contact
        const existing = await prisma.lead.findFirst({
            where: { contact_phone: phone },
        });
        if (existing) return; // Already has a lead record

        // Find super admin
        const superBoss = await prisma.agent.findFirst({
            where: { role: 'super_boss', status: 'active' },
            select: { id: true, phone: true, name: true },
        });

        // Create lead record
        await prisma.lead.create({
            data: {
                tenant_id: tenant.id,
                contact_phone: phone,
                source,
                lead_status: 'warm',
                lifecycle_stage: 'NEW',
                assigned_agent_id: superBoss?.id || undefined,
                created_by: undefined, // AI-created, no human author
            },
        });

        // Assign contact to super admin if not already assigned
        await prisma.contact.update({
            where: { phone_number: phone },
            data: {
                assigned_agent_id: superBoss?.id || undefined,
            },
        });

        // Notify super admin
        if (superBoss?.phone) {
            const contact = await prisma.contact.findUnique({
                where: { phone_number: phone },
                select: { name: true, source: true, intent: true },
            });
            const waPhone = superBoss.phone.replace(/^\+/, '');
            await whatsappService.sendText(waPhone,
                `📋 *New Lead Assigned to You*\n\nName: ${contact?.name || 'Unknown'}\nPhone: ${phone}\nSource: ${source}\nIntent: ${contact?.intent || 'Not yet qualified'}\n\nPanditji AI is qualifying this lead on WhatsApp.`
            ).catch(() => {});
        }

        logger.info(`[LeadAutoEngage] External lead record created for ${phone} from ${source}, assigned to super admin`);
    } catch (err) {
        logger.warn(`[LeadAutoEngage] Failed to create lead record for ${phone}: ${(err as Error).message}`);
    }
}

/**
 * Template C: Auto-start conversation for internally created leads.
 * Sends greeting + shows properties immediately. No re-qualification.
 */
export async function autoEngageInternalLead(phone: string): Promise<void> {
    try {
        const contact = await prisma.contact.findUnique({
            where: { phone_number: phone },
            select: {
                name: true,
                intent: true,
                // Phase 5: legacy demand_main_category / demand_bhk dropped.
                // Read the canonical SoT instead and pluck bhk + property_type
                // labels for the greeting blurb.
                demand_schema_values: true,
                preferred_location: true,
                budget_max: true,
                assigned_agent: { select: { name: true, phone: true } },
            },
        });
        if (!contact) return;

        const waPhone = phone.replace(/^\+/, '');
        const displayName = contact.name || 'there';
        const agentName = contact.assigned_agent?.name || 'our team';

        // Build context-aware greeting from canonical schema values.
        const schema = ((contact as any).demand_schema_values ?? {}) as Record<string, any>;
        const bhkLabel = typeof schema.bhk === 'string' ? schema.bhk : null;
        const propertyTypeLabel = typeof schema.property_type === 'string'
            ? schema.property_type
            : (typeof schema.type === 'string' ? schema.type : null);
        const details: string[] = [];
        if (bhkLabel) details.push(`${bhkLabel} BHK`);
        if (propertyTypeLabel) details.push(propertyTypeLabel);
        if (contact.preferred_location) details.push(`in ${contact.preferred_location}`);
        if (contact.budget_max) details.push(`budget ₹${contact.budget_max}`);

        const requirementLine = details.length > 0
            ? `I have some great ${details.join(', ')} properties that match your requirements.`
            : `I can help you find the perfect property.`;

        // Check if session is active (within 24h)
        const sessionActive = await SessionTracker.isSessionActive(phone);

        if (sessionActive) {
            // Within 24h window — send free-form text
            await whatsappService.sendText(waPhone, [
                `Namaste ${displayName}! 🙏`,
                '',
                `I'm Panditji from Realty Pandit. ${agentName} from our team has connected us.`,
                '',
                requirementLine,
                '',
                `Let me show you the best options!`,
                '',
                `Browse more: ${WEBSITE_URL}/properties`,
            ].join('\n'));
        } else {
            // Outside 24h — use approved template
            await whatsappService.sendTemplate(waPhone, 'rp_welcome_buyer', {
                name: displayName,
            });
        }

        logger.info(`[LeadAutoEngage] Template C sent to ${phone} (internal lead)`);
    } catch (err) {
        logger.warn(`[LeadAutoEngage] Auto-engage failed for ${phone}: ${(err as Error).message}`);
    }
}

/**
 * Handle dealer identification — mark as partner agent and notify super admin.
 */
export async function handleDealerIdentified(phone: string): Promise<void> {
    try {
        await prisma.contact.update({
            where: { phone_number: phone },
            data: {
                contact_type: 'PARTNER_AGENT',
                lead_type: 'PARTNER_REFERRAL',
            },
        });

        // Notify super admin
        const superBoss = await prisma.agent.findFirst({
            where: { role: 'super_boss', status: 'active' },
            select: { phone: true },
        });
        if (superBoss?.phone) {
            const contact = await prisma.contact.findUnique({
                where: { phone_number: phone },
                select: { name: true },
            });
            const waPhone = superBoss.phone.replace(/^\+/, '');
            await whatsappService.sendText(waPhone,
                `🤝 *New Dealer Identified*\n\nName: ${contact?.name || 'Unknown'}\nPhone: ${phone}\n\nIdentified via WhatsApp conversation. AI is collecting their client's requirements.`
            ).catch(() => {});
        }

        logger.info(`[LeadAutoEngage] Dealer identified: ${phone}, super admin notified`);
    } catch (err) {
        logger.warn(`[LeadAutoEngage] Dealer handling failed for ${phone}: ${(err as Error).message}`);
    }
}

/**
 * Reverse geocode lat/lng to get area name using Google Maps API.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return null;

    try {
        const axios = (await import('axios')).default;
        const resp = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
            params: { latlng: `${lat},${lng}`, key: apiKey, language: 'en' },
        });

        const results = resp.data?.results || [];
        if (results.length === 0) return null;

        // Try to find neighborhood/sublocality name
        for (const result of results) {
            for (const component of result.address_components || []) {
                if (component.types.includes('sublocality_level_1') || component.types.includes('neighborhood')) {
                    return component.long_name;
                }
            }
        }

        // Fallback to formatted address
        return results[0]?.formatted_address || null;
    } catch (err) {
        logger.warn(`[LeadAutoEngage] Reverse geocode failed: ${(err as Error).message}`);
        return null;
    }
}
