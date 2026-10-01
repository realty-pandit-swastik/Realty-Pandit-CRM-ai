
import { Router } from 'express';
import prisma from '../db';
import { apiKeyAuth } from '../middleware/apikey';
import logger from '../utils/logger';
import { normalizePhone } from '../utils/phone';
import { isRealEmail } from '../utils/email';
import { sendBuyerConfirmationWhatsApp, sendBuyerConfirmationEmail } from '../services/lead_notifications';
import { assignViaRoundRobin } from '../services/lead_assignment';
import { assignContact } from '../services/assign_contact';

const router = Router();
router.use(apiKeyAuth);

/**
 * 99acres Lead Webhook Adapter.
 * Maps 99acres lead format to our SSOT.
 *
 * 99acres typically sends: { name, mobile, email, project_name, city, budget, requirement_type }
 */
router.post('/webhook', async (req, res) => {
    logger.info('[99acres] Incoming lead:', JSON.stringify(req.body));

    const {
        name, mobile, phone, email,
        project_name, city, locality, budget,
        requirement_type, property_type, bedrooms
    } = req.body;

    const phoneNumber = normalizePhone(mobile || phone);
    if (!phoneNumber) {
        return res.status(400).json({ error: 'mobile or phone is required' });
    }

    try {
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return res.status(500).json({ error: 'System not configured' });

        // Map 99acres requirement_type to our intent
        let intent: string | null = null;
        if (requirement_type) {
            const rt = requirement_type.toLowerCase();
            if (rt.includes('buy') || rt.includes('sale')) intent = 'buy';
            else if (rt.includes('rent')) intent = 'rent';
            else if (rt.includes('sell')) intent = 'sell';
        }

        // Map location
        const location = [locality, city].filter(Boolean).join(', ') || null;

        // ── Fetch existing for smart merge ────────────────────────────────────
        const existing = await prisma.contact.findUnique({
            where: { phone_number: phoneNumber },
            select: { name: true, email: true, assigned_agent_id: true },
        });

        // Smart merge: email — never overwrite a real email with a fake one
        const incomingEmail = isRealEmail(email) ? (email as string) : null;
        const mergedEmail: string | undefined = incomingEmail !== null
            ? incomingEmail
            : (existing?.email ?? undefined);

        // Smart merge: name — keep the longer (richer) value
        const incomingNameTrimmed = (name || '').trim();
        const existingNameTrimmed = (existing?.name || '').trim();
        let mergedName: string | undefined;
        if (!incomingNameTrimmed) {
            mergedName = undefined;
        } else if (!existingNameTrimmed) {
            mergedName = incomingNameTrimmed;
        } else {
            mergedName = incomingNameTrimmed.length >= existingNameTrimmed.length
                ? incomingNameTrimmed
                : existingNameTrimmed;
        }

        const contact = await prisma.contact.upsert({
            where: { phone_number: phoneNumber },
            update: {
                name: mergedName,
                email: mergedEmail,
                source: '99acres',
                intent: intent || undefined,
                preferred_location: location || undefined,
                property_type: property_type || undefined,
                last_channel: '99acres',
                last_interaction: new Date(),
            },
            create: {
                phone_number: phoneNumber,
                name: mergedName ?? null,
                email: mergedEmail ?? null,
                source: '99acres',
                contact_type: 'BUYER',
                intent,
                preferred_location: location,
                property_type: property_type || null,
                budget_max: budget ? parseFloat(String(budget)) : null,
                tenant_id: tenant.id,
                last_channel: '99acres',
                last_interaction: new Date(),
                lead_status: 'warm',
            }
        });

        await prisma.interaction.create({
            data: {
                tenant_id: tenant.id,
                phone_number: phoneNumber,
                channel: '99acres',
                direction: 'inbound',
                event_type: 'lead_capture',
                content: `99acres lead: ${name || 'Unknown'} interested in ${project_name || property_type || 'property'} at ${location || 'N/A'}`,
                metadata: {
                    source: '99acres',
                    project_name, bedrooms, budget,
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
            }
        }

        // Notify buyer immediately (fire-and-forget)
        sendBuyerConfirmationWhatsApp(phoneNumber, name || null, '99acres')
            .catch(err => logger.warn('[99acres] Buyer WA failed:', err.message));
        if (email) {
            sendBuyerConfirmationEmail(email, name || null)
                .catch(err => logger.warn('[99acres] Buyer email failed:', err.message));
        }

        // Auto-create NEW deal so AI qualification cadence kicks in.
        const { ensureDealForLead } = await import('../services/ensure_deal');
        ensureDealForLead({ contactPhone: phoneNumber, source: '99acres', sourceRef: project_name || null, assignedAgentId: agentId })
            .catch(err => logger.error(`[99acres] ensureDealForLead failed for ${phoneNumber}: ${(err as Error).message}`));

        logger.info(`[99acres] Lead captured: ${phoneNumber} (${name || 'unnamed'})`);
        res.status(201).json({ success: true, contact_id: contact.phone_number });
    } catch (error) {
        logger.error('[99acres] Error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

export default router;
