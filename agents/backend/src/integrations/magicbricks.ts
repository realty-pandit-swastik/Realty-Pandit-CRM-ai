
import { Router } from 'express';
import prisma from '../db';
import { deriveBudgetMin, DEFAULT_TIMELINE } from '../utils/demand_defaults';
import { apiKeyAuth } from '../middleware/apikey';
import logger from '../utils/logger';
import { normalizePhone } from '../utils/phone';
import { sendBuyerConfirmationWhatsApp, sendBuyerConfirmationEmail } from '../services/lead_notifications';
import { assignViaRoundRobin, assignViaPropertyUploader, assignViaManagerRoundRobin, resolveAgentByMagicBricksSubUser } from '../services/lead_assignment';
import { assignContact, type AssignmentMethod } from '../services/assign_contact';
import { ensureDealForLead } from '../services/ensure_deal';
import { foldLegacyDemand } from '../utils/demand_canonical';
import { resolveDemandTaxonomy } from '../utils/demand_taxonomy';
import { extractLocationFromMsg } from '../utils/parse_lead_location';
import { geocodeAddress } from '../utils/geocode';

const router = Router();

/**
 * MagicBricks PUSH webhook — MagicBricks calls this endpoint with lead data.
 * Auth: api_key query param (NOT X-API-Key header).
 * Supports both GET and POST (MagicBricks sends GET with query params).
 *
 * MagicBricks fields: mobile, name, email, msg, project, City, isd, dt, time, source
 * Our response: plain text "Success: Lead punched in the CRM" / "Failure: Lead already exist"
 *
 * Register this endpoint with MagicBricks as:
 *   https://api.realtypandit.in/external/magicbricks/push
 * They will append: ?api_key=<MAGICBRICKS_API_KEY>&mobile=9999...&name=...
 */
async function handleMagicBricksPush(req: any, res: any) {
    const params = { ...req.query, ...req.body };

    const {
        api_key, mobile, name, email, msg, project, City, city, isd, dt, source: src,
        looking_for, property_for, property_type, prop_type, bhk, bedroom, unit_type,
        budget, min_budget, max_budget, sub_user, listing_id,
    } = params;

    // Validate api_key
    const expectedKey = process.env.MAGICBRICKS_API_KEY;
    if (!expectedKey) {
        logger.error('[MagicBricks] MAGICBRICKS_API_KEY not configured');
        return res.status(500).send('Service not configured');
    }
    if (api_key !== expectedKey) {
        logger.warn('[MagicBricks] Invalid api_key attempt:', api_key);
        return res.status(401).send('Unauthorized');
    }

    const rawPhone = mobile || params.phone;
    const phoneNumber = normalizePhone(rawPhone ? String(rawPhone) : '');
    if (!phoneNumber) {
        logger.warn('[MagicBricks] Missing or invalid mobile:', rawPhone);
        return res.status(400).send('mobile is required');
    }

    logger.info('[MagicBricks] Push lead:', JSON.stringify(params));

    try {
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return res.status(500).send('System not configured');

        // Check duplicate
        const existing = await prisma.contact.findUnique({ where: { phone_number: phoneNumber } });
        if (existing) {
            // Update last interaction + re-log the enquiry. If the new msg carries a granular area and the
            // stored preferred_location is blank or just the city, upgrade it (+ geocode) — never downgrade.
            const reGranular = extractLocationFromMsg(msg ? String(msg) : null);
            const updateData: any = { last_channel: 'magicbricks', last_interaction: new Date() };
            const stored = (existing.preferred_location || '').trim();
            const cityVal = String(City || city || '').trim();
            if (reGranular && (!stored || stored.toLowerCase() === cityVal.toLowerCase())) {
                updateData.preferred_location = reGranular;
            }
            await prisma.contact.update({ where: { phone_number: phoneNumber }, data: updateData });
            if (updateData.preferred_location) {
                geocodeAddress(updateData.preferred_location)
                    .then(geo => geo && prisma.contact.update({
                        where: { phone_number: phoneNumber },
                        data: { preferred_lat: geo.lat, preferred_lng: geo.lng },
                    }))
                    .catch(err => logger.warn('[MagicBricks] geocode failed:', (err as Error).message));
            }
            await prisma.interaction.create({
                data: {
                    tenant_id: tenant.id,
                    phone_number: phoneNumber,
                    channel: 'magicbricks',
                    direction: 'inbound',
                    event_type: 'lead_capture',
                    content: msg ? String(msg) : `MagicBricks re-enquiry for ${project || 'property'}`,
                    metadata: {
                        source: 'magicbricks', project, city: City || city,
                        listing_id: listing_id ?? null,
                        sub_user: sub_user ?? null,
                        looking_for: looking_for || property_for,
                        property_type: property_type || prop_type,
                        bhk: bhk || bedroom,
                        budget_max: max_budget || budget,
                        isd, dt,
                        original_data: params,
                    },
                },
            });
            logger.info(`[MagicBricks] Duplicate lead: ${phoneNumber}`);
            // Task 2+3 (2026-07-31): duplicate re-enquiry — timeline marker + share with the newly-attributed agent.
            try {
                const reAttr = sub_user ? await resolveAgentByMagicBricksSubUser(String(sub_user)) : null;
                const { recordLeadReingest } = await import('../services/lead_reingest');
                await recordLeadReingest({ phone: phoneNumber, source: 'magicbricks', attributedAgentId: reAttr, subUser: sub_user ? String(sub_user) : null });
            } catch (e) { logger.warn('[MagicBricks] reingest failed: ' + (e as Error).message); }
            return res.send('Failure: Lead already exist');
        }

        const leadCity = String(City || city || '').trim() || null;
        const leadName = name ? String(name).trim() : null;
        const leadEmail = email ? String(email).trim() : null;
        const notes = msg ? String(msg).trim() : null;
        const projectName = project ? String(project).trim() : null;
        // MagicBricks puts the real area only inside `msg` ("...for Sale in Sector 6 Vaishali, Ghaziabad...");
        // the `City` field is just the city. Capture the granular location, falling back to the city.
        const granularLocation = extractLocationFromMsg(notes) || leadCity;

        // Intent: buy / rent
        const rawIntent = String(looking_for || property_for || '').toLowerCase();
        let intent: string | null = null;
        if (rawIntent.includes('rent') || rawIntent.includes('lease')) intent = 'rent';
        else if (rawIntent.includes('buy') || rawIntent.includes('sale') || rawIntent.includes('purchase')) intent = 'buy';
        else intent = 'buy'; // default for MagicBricks enquiries

        // Property type: residential / commercial
        const rawPropType = String(property_type || prop_type || unit_type || '').toLowerCase();
        let mappedPropertyType: string | null = null;
        if (rawPropType.includes('commercial') || rawPropType.includes('office') || rawPropType.includes('shop')) {
            mappedPropertyType = 'commercial';
        } else if (rawPropType.includes('residential') || rawPropType.includes('apartment') || rawPropType.includes('flat') || rawPropType.includes('villa') || rawPropType.includes('plot')) {
            mappedPropertyType = 'residential';
        } else if (rawPropType) {
            mappedPropertyType = rawPropType;
        }

        // BHK — extract integer from "3 BHK", "3", "3BHK", etc.
        const rawBhk = String(bhk || bedroom || '').trim();
        const bhkValue = rawBhk || null;
        const bhkInt = rawBhk ? (parseInt(rawBhk.replace(/\D.*/, ''), 10) || null) : null;

        // Classification slugs derived from property type
        let demandMainCategory: string | null = null;
        let demandCategory: string | null = null;
        let demandTypeSlug: string | null = null;
        const lowerPropType = (property_type || prop_type || unit_type || '').toLowerCase();
        if (lowerPropType.includes('flat') || lowerPropType.includes('apartment')) {
            demandMainCategory = 'residential'; demandCategory = 'apartment'; demandTypeSlug = 'flat';
        } else if (lowerPropType.includes('villa')) {
            demandMainCategory = 'residential'; demandCategory = 'individual_housing'; demandTypeSlug = 'villa';
        } else if (lowerPropType.includes('house') || lowerPropType.includes('independent')) {
            demandMainCategory = 'residential'; demandCategory = 'individual_housing'; demandTypeSlug = 'independent_house';
        } else if (lowerPropType.includes('plot') || lowerPropType.includes('land')) {
            demandMainCategory = 'residential'; demandCategory = 'plot_land'; demandTypeSlug = 'residential_plot';
        } else if (lowerPropType.includes('office')) {
            demandMainCategory = 'commercial'; demandCategory = 'office'; demandTypeSlug = 'commercial_office_space';
        } else if (lowerPropType.includes('shop') || lowerPropType.includes('retail')) {
            demandMainCategory = 'commercial'; demandCategory = 'retail'; demandTypeSlug = 'retail_shop';
        } else if (lowerPropType.includes('commercial')) {
            demandMainCategory = 'commercial';
        } else if (lowerPropType.includes('residential') || mappedPropertyType === 'residential') {
            demandMainCategory = 'residential';
            // MagicBricks sends generic "Residential" — extract specific type from msg
            const msgLower = String(msg || '').toLowerCase();
            if (msgLower.includes('builder floor')) {
                demandCategory = 'apartment'; demandTypeSlug = 'builder_floor';
            } else if (msgLower.includes('penthouse')) {
                demandCategory = 'apartment'; demandTypeSlug = 'penthouse';
            } else if (msgLower.includes('studio')) {
                demandCategory = 'apartment'; demandTypeSlug = 'studio_apartment';
            } else if (msgLower.includes('villa')) {
                demandCategory = 'individual_housing'; demandTypeSlug = 'villa';
            } else if (msgLower.includes('independent house') || msgLower.includes('row house') || msgLower.includes('bungalow')) {
                demandCategory = 'individual_housing'; demandTypeSlug = 'independent_house';
            } else if (msgLower.includes('plot') || msgLower.includes('land')) {
                demandCategory = 'plot_land'; demandTypeSlug = 'residential_plot';
            } else if (msgLower.includes('multistorey') || msgLower.includes('multi storey') || msgLower.includes('apartment') || msgLower.includes('flat')) {
                demandCategory = 'apartment'; demandTypeSlug = 'flat';
            } else {
                // Residential but no specific type found — default to apartment
                demandCategory = 'apartment'; demandTypeSlug = 'flat';
            }
        }

        // Budget
        const budgetMax = max_budget ? parseFloat(String(max_budget).replace(/[^\d.]/g, ''))
            : budget ? parseFloat(String(budget).replace(/[^\d.]/g, '')) : null;
        const budgetMin = min_budget ? parseFloat(String(min_budget).replace(/[^\d.]/g, '')) : null;

        // Budget-aware intent guard (2026-06-12): MagicBricks defaults ambiguous enquiries to "buy"
        // (above), but a residential lead with a budget in the monthly-rent band (₹3k–₹2L) is almost
        // certainly a RENTAL — buying a flat for ₹16–35k is impossible, so it matches nothing and
        // dead-ends. Correct it so matching works (this was mislabeling ~118 rental leads as
        // un-matchable "buy at ₹16k"). See docs follow-up 2026-06-12.
        if (intent === 'buy' && budgetMax && budgetMax >= 3000 && budgetMax <= 200000 && (bhkInt != null || demandMainCategory === 'residential')) {
            intent = 'rent';
        }

        // Stage 3 (2026-05-31): resolve the requirement into the canonical taxonomy node.
        const demandTax = await resolveDemandTaxonomy({ main_category: demandMainCategory || undefined, property_type: demandTypeSlug || mappedPropertyType || undefined, bhk: bhkInt ?? null });

        const contact = await prisma.contact.create({
            data: {
                phone_number: phoneNumber,
                name: leadName,
                email: leadEmail,
                source: 'magicbricks',
                contact_type: 'BUYER',
                intent,
                preferred_location: granularLocation,
                property_type: mappedPropertyType,
                budget_max: budgetMax,
                // 2026-07-29: if only a max is given, set min = 10% below max; default timeline 0–1 month.
                budget_min: deriveBudgetMin(budgetMin, budgetMax),
                timeline: DEFAULT_TIMELINE,
                demand_taxonomy_node_id: demandTax.demand_taxonomy_node_id ?? undefined,
                needs_taxonomy_review: demandTax.needs_review || undefined,
                // Persist legacy classification from the resolved node (2026-05-31).
                sub_category_id: demandTax.sub_category_id ?? undefined,
                category_id: demandTax.category_id ?? undefined,
                type_id: demandTax.type_id ?? undefined,
                // Phase 1 dual-write — canonical demand SoT.
                ...(foldLegacyDemand({ demand_bhk: bhkInt }) as any),
                tenant_id: tenant.id,
                last_channel: 'magicbricks',
                last_interaction: new Date(),
                lead_status: 'warm',
            },
        });

        // Geocode the granular location for map + proximity matching — fire-and-forget so it never blocks or
        // breaks the webhook response. geocodeAddress is non-throwing; lat/lng stay null on failure (as before).
        if (granularLocation) {
            geocodeAddress(granularLocation)
                .then(geo => geo && prisma.contact.update({
                    where: { phone_number: phoneNumber },
                    data: { preferred_lat: geo.lat, preferred_lng: geo.lng },
                }))
                .catch(err => logger.warn('[MagicBricks] geocode failed:', (err as Error).message));
        }

        const intentLabel = intent === 'rent' ? 'Rent' : 'Buy';
        const typeLabel = mappedPropertyType || 'Property';
        const bhkLabel = bhkValue ? `${bhkValue} BHK ` : '';
        await prisma.interaction.create({
            data: {
                tenant_id: tenant.id,
                phone_number: phoneNumber,
                channel: 'magicbricks',
                direction: 'inbound',
                event_type: 'lead_capture',
                content: notes || `MagicBricks lead: ${leadName || 'Unknown'} wants to ${intentLabel} ${bhkLabel}${typeLabel} in ${leadCity || 'N/A'}`,
                metadata: {
                    source: 'magicbricks',
                    project: projectName,
                    city: leadCity,
                    listing_id: listing_id ?? null,
                    sub_user: sub_user ?? null,
                    intent,
                    property_type: mappedPropertyType,
                    bhk: bhkValue,
                    budget_min: budgetMin,
                    budget_max: budgetMax,
                    isd, dt,
                    original_data: params,
                },
            },
        });

        // LLM refinement (2026-08-01) — async, non-blocking. New-lead path only (dups return earlier).
        import('../services/demand_classifier').then(m => m.refineDemandWithLLM(phoneNumber, String(msg || notes || ''))).catch(() => {});

        // Assignment (mirrors 99acres SubUserName routing):
        //   1) sub_user → the listing agent. MagicBricks sends "<agent phone>@timesgroup.com".
        //   2) else project → property uploader (legacy best-effort).
        //   3) else: if a sub_user WAS present but didn't map (inactive/unknown) → a manager for
        //      review so the mapping gets fixed; otherwise (no sub_user) keep round-robin so the
        //      bulk of un-attributed leads aren't all dumped on managers.
        let agentId: string | null = null;
        let method: AssignmentMethod | null = null;
        let subUserUnmatched = false;
        if (sub_user) {
            agentId = await resolveAgentByMagicBricksSubUser(String(sub_user));
            if (agentId) method = 'sub_user'; else subUserUnmatched = true;
        }
        if (!agentId && projectName) {
            agentId = await assignViaPropertyUploader(projectName);
            if (agentId) method = 'uploader';
        }
        if (!agentId) {
            agentId = subUserUnmatched ? await assignViaManagerRoundRobin() : await assignViaRoundRobin();
            if (agentId) method = subUserUnmatched ? 'manager_review' : 'round_robin';
            if (subUserUnmatched) {
                logger.warn(`[MagicBricks] sub_user "${sub_user}" did not map to an active agent — routed to a manager for review (${phoneNumber})`);
            }
        }
        if (agentId) {
            await assignContact(phoneNumber, agentId, method);
            const { createQualifyTask } = await import('../services/workflow_task_service');
            createQualifyTask({ tenantId: tenant.id, contactPhone: phoneNumber, assignedTo: agentId, source: 'magicbricks' })
                .catch(err => logger.warn('[MagicBricks] Workflow task failed:', (err as Error).message));
        }

        // Auto-create NEW deal so AI qualification cadence kicks in (B1).
        ensureDealForLead({
            contactPhone: phoneNumber,
            source: 'magicbricks',
            assignedAgentId: agentId ?? null,
        }).catch((err) => {
            logger.error(`[MagicBricks] ensureDealForLead failed for ${phoneNumber}: ${(err as Error).message}`);
        });

        sendBuyerConfirmationWhatsApp(phoneNumber, leadName, 'magicbricks')
            .catch(err => logger.warn('[MagicBricks] Buyer WA failed:', (err as Error).message));
        if (leadEmail) {
            sendBuyerConfirmationEmail(leadEmail, leadName)
                .catch(err => logger.warn('[MagicBricks] Buyer email failed:', (err as Error).message));
        }

        logger.info(`[MagicBricks] Lead captured: ${phoneNumber} (${leadName || 'unnamed'})`);
        return res.send('Success: Lead punched in the CRM');
    } catch (error) {
        logger.error('[MagicBricks] Error:', error);
        return res.status(500).send('Internal error');
    }
}

// MagicBricks PUSH endpoint — GET + POST (no header auth, uses api_key query param)
router.get('/push', handleMagicBricksPush);
router.post('/push', handleMagicBricksPush);

/**
 * Existing POST /webhook — kept for backward compat. Uses X-API-Key header.
 */
router.post('/webhook', apiKeyAuth, async (req, res) => {
    logger.info('[MagicBricks] Incoming lead:', JSON.stringify(req.body));

    const {
        buyer_name, name, buyer_phone, phone, buyer_email, email,
        property_id, city, locality, budget_range, budget,
        looking_for, property_type
    } = req.body;

    const phoneNumber = normalizePhone(buyer_phone || phone);
    const leadName = buyer_name || name;
    const leadEmail = buyer_email || email;

    if (!phoneNumber) {
        return res.status(400).json({ error: 'buyer_phone or phone is required' });
    }

    try {
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return res.status(500).json({ error: 'System not configured' });

        let intent: string | null = null;
        if (looking_for) {
            const lf = looking_for.toLowerCase();
            if (lf.includes('buy') || lf.includes('sale')) intent = 'buy';
            else if (lf.includes('rent')) intent = 'rent';
        }

        const location = [locality, city].filter(Boolean).join(', ') || null;
        const parsedBudget = budget_range ? parseFloat(String(budget_range).replace(/[^\d.]/g, '')) : (budget ? parseFloat(String(budget)) : null);

        const contact = await prisma.contact.upsert({
            where: { phone_number: phoneNumber },
            update: {
                name: leadName || undefined,
                email: leadEmail || undefined,
                source: 'magicbricks',
                intent: intent || undefined,
                preferred_location: location || undefined,
                property_type: property_type || undefined,
                last_channel: 'magicbricks',
                last_interaction: new Date(),
            },
            create: {
                phone_number: phoneNumber,
                name: leadName || null,
                email: leadEmail || null,
                source: 'magicbricks',
                contact_type: 'BUYER',
                intent,
                preferred_location: location,
                property_type: property_type || null,
                budget_max: parsedBudget,
                tenant_id: tenant.id,
                last_channel: 'magicbricks',
                last_interaction: new Date(),
                lead_status: 'warm',
            }
        });

        await prisma.interaction.create({
            data: {
                tenant_id: tenant.id,
                phone_number: phoneNumber,
                channel: 'magicbricks',
                direction: 'inbound',
                event_type: 'lead_capture',
                content: `MagicBricks lead: ${leadName || 'Unknown'} looking for ${looking_for || 'property'} at ${location || 'N/A'}`,
                metadata: {
                    source: 'magicbricks',
                    property_id, budget_range,
                    original_data: req.body
                }
            }
        });

        const isNew = !contact.assigned_agent_id;
        if (isNew) {
            let agentId: string | null = null;
            let method: AssignmentMethod | null = null;
            if (property_id) {
                agentId = await assignViaPropertyUploader(property_id);
                if (agentId) method = 'uploader';
            }
            if (!agentId) {
                agentId = await assignViaRoundRobin();
                if (agentId) method = 'round_robin';
            }
            if (agentId) {
                await assignContact(phoneNumber, agentId, method);
                const { createQualifyTask } = await import('../services/workflow_task_service');
                createQualifyTask({ tenantId: tenant.id, contactPhone: phoneNumber, assignedTo: agentId, source: 'magicbricks' })
                    .catch(err => logger.warn('[MagicBricks] Workflow task failed:', (err as Error).message));
            }

            // Auto-create NEW deal so AI qualification cadence kicks in (B1 — legacy /webhook path).
            ensureDealForLead({
                contactPhone: phoneNumber,
                source: 'magicbricks',
                assignedAgentId: agentId,
            }).catch((err) => {
                logger.error(`[MagicBricks] ensureDealForLead failed for ${phoneNumber}: ${(err as Error).message}`);
            });
        }

        sendBuyerConfirmationWhatsApp(phoneNumber, leadName || null, 'magicbricks')
            .catch(err => logger.warn('[MagicBricks] Buyer WA failed:', err.message));
        if (leadEmail) {
            sendBuyerConfirmationEmail(leadEmail, leadName || null)
                .catch(err => logger.warn('[MagicBricks] Buyer email failed:', err.message));
        }

        logger.info(`[MagicBricks] Lead captured: ${phoneNumber} (${leadName || 'unnamed'})`);
        res.status(201).json({ success: true, contact_id: contact.phone_number });
    } catch (error) {
        logger.error('[MagicBricks] Error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

export default router;
