
import { Router } from 'express';
import prisma from '../db';
import { apiKeyAuth } from '../middleware/apikey';
import logger from '../utils/logger';
import { normalizePhone } from '../utils/phone';
import { sendBuyerConfirmationWhatsApp, sendBuyerConfirmationEmail } from '../services/lead_notifications';
import { assignViaRoundRobin } from '../services/lead_assignment';
import { assignContact } from '../services/assign_contact';

const router = Router();
router.use(apiKeyAuth);

/**
 * Housing.com Lead Webhook Adapter.
 * Maps Housing.com lead format to our SSOT.
 *
 * Housing.com typically sends: { lead_name, lead_phone, lead_email, project, location, configuration, intent_type }
 */
router.post('/webhook', async (req, res) => {
    logger.info('[Housing] Incoming lead:', JSON.stringify(req.body));

    const {
        lead_name, name, lead_phone, phone, lead_email, email,
        project, location, city, configuration,
        intent_type, budget_min, budget_max
    } = req.body;

    const phoneNumber = normalizePhone(lead_phone || phone);
    const leadName = lead_name || name;
    const leadEmail = lead_email || email;

    if (!phoneNumber) {
        return res.status(400).json({ error: 'lead_phone or phone is required' });
    }

    try {
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return res.status(500).json({ error: 'System not configured' });

        let intent: string | null = null;
        if (intent_type) {
            const it = intent_type.toLowerCase();
            if (it.includes('buy') || it.includes('sale')) intent = 'buy';
            else if (it.includes('rent')) intent = 'rent';
        }

        const loc = [location, city].filter(Boolean).join(', ') || null;

        const contact = await prisma.contact.upsert({
            where: { phone_number: phoneNumber },
            update: {
                name: leadName || undefined,
                email: leadEmail || undefined,
                source: 'housing',
                intent: intent || undefined,
                preferred_location: loc || undefined,
                last_channel: 'housing',
                last_interaction: new Date(),
            },
            create: {
                phone_number: phoneNumber,
                name: leadName || null,
                email: leadEmail || null,
                source: 'housing',
                contact_type: 'BUYER',
                intent,
                preferred_location: loc,
                budget_min: budget_min ? parseFloat(String(budget_min)) : null,
                budget_max: budget_max ? parseFloat(String(budget_max)) : null,
                tenant_id: tenant.id,
                last_channel: 'housing',
                last_interaction: new Date(),
                lead_status: 'warm',
            }
        });

        await prisma.interaction.create({
            data: {
                tenant_id: tenant.id,
                phone_number: phoneNumber,
                channel: 'housing',
                direction: 'inbound',
                event_type: 'lead_capture',
                content: `Housing.com lead: ${leadName || 'Unknown'} for ${project || configuration || 'property'} at ${loc || 'N/A'}`,
                metadata: {
                    source: 'housing',
                    project, configuration, budget_min, budget_max,
                    original_data: req.body
                }
            }
        });

        // Round-robin assignment if lead has no CRM agent yet
        let agentId: string | null = contact.assigned_agent_id ?? null;
        if (!agentId) {
            agentId = await assignViaRoundRobin();
            if (agentId) {
                await assignContact(phoneNumber, agentId, 'round_robin');
                // Create workflow qualification task
                const { createQualifyTask } = await import('../services/workflow_task_service');
                createQualifyTask({ tenantId: tenant.id, contactPhone: phoneNumber, assignedTo: agentId, source: 'housing' })
                    .catch(err => logger.warn('[Housing] Workflow task failed:', (err as Error).message));
            }
        }

        // Notify buyer immediately (fire-and-forget)
        sendBuyerConfirmationWhatsApp(phoneNumber, leadName || null, 'housing')
            .catch(err => logger.warn('[Housing] Buyer WA failed:', err.message));
        if (leadEmail) {
            sendBuyerConfirmationEmail(leadEmail, leadName || null)
                .catch(err => logger.warn('[Housing] Buyer email failed:', err.message));
        }

        // Auto-create NEW deal so AI qualification cadence kicks in.
        const { ensureDealForLead } = await import('../services/ensure_deal');
        ensureDealForLead({ contactPhone: phoneNumber, source: 'housing', sourceRef: project || null, assignedAgentId: agentId })
            .catch(err => logger.error(`[Housing] ensureDealForLead failed for ${phoneNumber}: ${(err as Error).message}`));

        logger.info(`[Housing] Lead captured: ${phoneNumber} (${leadName || 'unnamed'})`);
        res.status(201).json({ success: true, contact_id: contact.phone_number });
    } catch (error) {
        logger.error('[Housing] Error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

export default router;
