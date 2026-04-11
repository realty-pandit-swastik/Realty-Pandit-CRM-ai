
import { Router } from 'express';
import prisma from '../db';
import { apiKeyAuth } from '../middleware/apikey';
import logger from '../utils/logger';
import { notify } from '../services/notify';

const router = Router();

// All external lead routes require API key
router.use(apiKeyAuth);

/**
 * POST /external/leads - Generic lead ingestion endpoint.
 * Accepts leads from any external source (99acres, MagicBricks, Housing.com, etc.)
 *
 * Body: { source, name, phone, email?, property_interest?, location?, budget?, notes? }
 */
router.post('/leads', async (req, res) => {
    const { source, name, phone, email, property_interest, location, budget, notes } = req.body;

    if (!source || !phone) {
        return res.status(400).json({ error: 'source and phone are required' });
    }

    const validSources = ['99acres', 'magicbricks', 'housing', 'website', 'manual', 'other'];
    if (!validSources.includes(source)) {
        return res.status(400).json({ error: `Invalid source. Must be one of: ${validSources.join(', ')}` });
    }

    try {
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) {
            return res.status(500).json({ error: 'System not configured' });
        }

        // Determine intent from property_interest
        let intent: string | null = null;
        if (property_interest) {
            const interest = property_interest.toLowerCase();
            if (interest.includes('buy') || interest.includes('sale') || interest.includes('purchase')) intent = 'buy';
            else if (interest.includes('rent') || interest.includes('lease') || interest.includes('tenant')) intent = 'rent';
            else if (interest.includes('sell')) intent = 'sell';
        }

        // Upsert contact into SSOT
        const contact = await prisma.contact.upsert({
            where: { phone_number: phone },
            update: {
                name: name || undefined,
                email: email || undefined,
                source,
                last_channel: source,
                last_interaction: new Date(),
                intent: intent || undefined,
                preferred_location: location || undefined,
            },
            create: {
                phone_number: phone,
                name: name || null,
                email: email || null,
                source,
                contact_type: 'UNKNOWN',
                intent,
                preferred_location: location || null,
                budget_max: budget ? parseFloat(budget) : null,
                tenant_id: tenant.id,
                last_channel: source,
                last_interaction: new Date(),
                lead_status: 'warm',
            }
        });

        // Log interaction
        await prisma.interaction.create({
            data: {
                tenant_id: tenant.id,
                phone_number: phone,
                channel: source,
                direction: 'inbound',
                event_type: 'lead_capture',
                content: notes || `Lead from ${source}${property_interest ? `: ${property_interest}` : ''}`,
                metadata: {
                    source,
                    property_interest,
                    location,
                    budget,
                    original_data: req.body
                }
            }
        });

        // Initialize lead score if not exists
        await prisma.leadScore.upsert({
            where: { phone_number: phone },
            update: {
                intent_score: intent ? 30 : 10,
                engagement_score: 20,
            },
            create: {
                phone_number: phone,
                tenant_id: tenant.id,
                intent_score: intent ? 30 : 10,
                engagement_score: 20,
                reliability_score: 50,
                urgency_score: 20,
                total_score: intent ? 120 : 100,
            }
        });

        logger.info(`[ExternalLead] New lead from ${source}: ${phone} (${name || 'unnamed'})`);

        // Assign agent if new (round-robin)
        const isNew = !contact.assigned_agent_id;
        if (isNew) {
            const { assignViaRoundRobin } = await import('../services/lead_assignment');
            const agentId = await assignViaRoundRobin();
            if (agentId) {
                await prisma.contact.update({ where: { phone_number: phone }, data: { assigned_agent_id: agentId } });
                // Create workflow qualification task
                const { createQualifyTask } = await import('../services/workflow_task_service');
                createQualifyTask({ tenantId: tenant.id, contactPhone: phone, assignedTo: agentId, source })
                    .catch(err => logger.warn('[ExternalLead] Workflow task failed:', (err as Error).message));
            }
        }

        // Notify admins about new external lead
        const admins = await prisma.agent.findMany({ where: { role: { in: ['super_boss', 'manager'] }, status: 'active' }, select: { id: true, phone: true, email: true, name: true } });
        if (admins.length > 0) {
            notify('external_lead_captured', admins.map(a => ({ id: a.id, type: 'agent' as const, phone: a.phone, email: a.email || undefined, name: a.name })), {
                name: name || 'Unknown', phone, source, intent,
            });
        }

        res.status(201).json({
            success: true,
            contact_id: contact.phone_number,
            contact_type: contact.contact_type,
            lead_status: contact.lead_status,
            message: `Lead ingested from ${source}. Panditji will initiate outreach.`
        });
    } catch (error) {
        logger.error('[ExternalLead] Error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

/**
 * POST /external/leads/batch - Batch lead ingestion (up to 50 at once)
 */
router.post('/leads/batch', async (req, res) => {
    const { leads, source } = req.body;

    if (!source || !Array.isArray(leads) || leads.length === 0) {
        return res.status(400).json({ error: 'source and leads array are required' });
    }

    if (leads.length > 50) {
        return res.status(400).json({ error: 'Maximum 50 leads per batch' });
    }

    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
        return res.status(500).json({ error: 'System not configured' });
    }

    const results = { success: 0, failed: 0, errors: [] as string[] };

    for (const lead of leads) {
        try {
            if (!lead.phone) {
                results.failed++;
                results.errors.push(`Missing phone for lead: ${lead.name || 'unknown'}`);
                continue;
            }

            await prisma.contact.upsert({
                where: { phone_number: lead.phone },
                update: {
                    name: lead.name || undefined,
                    email: lead.email || undefined,
                    source,
                    last_channel: source,
                    last_interaction: new Date(),
                },
                create: {
                    phone_number: lead.phone,
                    name: lead.name || null,
                    email: lead.email || null,
                    source,
                    contact_type: 'UNKNOWN',
                    tenant_id: tenant.id,
                    last_channel: source,
                    last_interaction: new Date(),
                    lead_status: 'warm',
                }
            });

            await prisma.interaction.create({
                data: {
                    tenant_id: tenant.id,
                    phone_number: lead.phone,
                    channel: source,
                    direction: 'inbound',
                    event_type: 'lead_capture',
                    content: `Batch lead from ${source}`,
                    metadata: { source, batch: true, original_data: lead }
                }
            });

            results.success++;
        } catch (err) {
            results.failed++;
            results.errors.push(`Failed for ${lead.phone}: ${(err as Error).message}`);
        }
    }

    logger.info(`[ExternalLead] Batch from ${source}: ${results.success} success, ${results.failed} failed`);

    res.status(201).json(results);
});

/**
 * GET /external/leads/status/:phone - Check lead status by phone
 */
router.get('/leads/status/:phone', async (req, res) => {
    try {
        const contact = await prisma.contact.findUnique({
            where: { phone_number: req.params.phone },
            select: {
                phone_number: true,
                name: true,
                contact_type: true,
                lead_status: true,
                source: true,
                last_interaction: true,
                lead_score: { select: { total_score: true } }
            }
        });

        if (!contact) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        res.json(contact);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

export default router;
