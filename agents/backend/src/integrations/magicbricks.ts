
import { Router } from 'express';
import prisma from '../db';
import { apiKeyAuth } from '../middleware/apikey';
import logger from '../utils/logger';
import { normalizePhone } from '../utils/phone';
import { sendBuyerConfirmationWhatsApp, sendBuyerConfirmationEmail } from '../services/lead_notifications';
import { assignViaRoundRobin, assignViaPropertyUploader } from '../services/lead_assignment';

const router = Router();
router.use(apiKeyAuth);

/**
 * MagicBricks Lead Webhook Adapter.
 * Maps MagicBricks lead format to our SSOT.
 *
 * MagicBricks typically sends: { buyer_name, buyer_phone, buyer_email, property_id, city, budget_range, looking_for }
 */
router.post('/webhook', async (req, res) => {
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

        // Smart assignment: use property uploader if property_id present, else round-robin
        const isNew = !contact.assigned_agent_id;
        if (isNew) {
            let agentId: string | null = null;
            if (property_id) {
                agentId = await assignViaPropertyUploader(property_id);
            }
            if (!agentId) {
                agentId = await assignViaRoundRobin();
            }
            if (agentId) {
                await prisma.contact.update({
                    where: { phone_number: phoneNumber },
                    data: { assigned_agent_id: agentId },
                });
                // Create workflow qualification task
                const { createQualifyTask } = await import('../services/workflow_task_service');
                createQualifyTask({ tenantId: tenant.id, contactPhone: phoneNumber, assignedTo: agentId, source: 'magicbricks' })
                    .catch(err => logger.warn('[MagicBricks] Workflow task failed:', (err as Error).message));
            }
        }

        // Notify buyer immediately (fire-and-forget)
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
