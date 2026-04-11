
import { Router, Request, Response } from 'express';
import prisma from '../db';
import logger from '../utils/logger';
import { normalizePhone } from '../utils/phone';
import { sendBuyerConfirmationWhatsApp, sendBuyerConfirmationEmail } from '../services/lead_notifications';
import { assignViaRoundRobin } from '../services/lead_assignment';

const router = Router();

const FB_VERIFY_TOKEN = process.env.FB_WEBHOOK_VERIFY_TOKEN || 'realty_pandit_fb_verify';

/**
 * GET /external/facebook/webhook
 * Facebook webhook verification (hub.challenge handshake)
 */
router.get('/webhook', (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === FB_VERIFY_TOKEN) {
        logger.info('[Facebook] Webhook verified');
        return res.status(200).send(challenge);
    }

    logger.warn('[Facebook] Webhook verification failed');
    res.status(403).json({ error: 'Forbidden' });
});

/**
 * POST /external/facebook/webhook
 * Facebook Lead Ads webhook — receives new leads from Lead Ad forms
 *
 * Facebook sends: { entry: [{ changes: [{ value: { leadgen_id, form_id, ... } }] }] }
 * We fetch the lead details via Graph API, then upsert into our CRM.
 */
router.post('/webhook', async (req: Request, res: Response) => {
    // Always respond 200 immediately (Facebook retries on non-200)
    res.status(200).json({ status: 'ok' });

    try {
        const entries = req.body?.entry || [];
        logger.info(`[Facebook] Webhook received: ${entries.length} entries`);

        for (const entry of entries) {
            const changes = entry.changes || [];

            for (const change of changes) {
                if (change.field !== 'leadgen') continue;

                const leadData = change.value;
                const leadgenId = leadData?.leadgen_id;

                if (!leadgenId) {
                    logger.warn('[Facebook] Missing leadgen_id in webhook');
                    continue;
                }

                // Fetch lead details from Graph API
                const accessToken = process.env.FB_ACCESS_TOKEN;
                if (!accessToken) {
                    logger.error('[Facebook] FB_ACCESS_TOKEN not set — cannot fetch lead details');
                    continue;
                }

                try {
                    const axios = require('axios');
                    const leadResp = await axios.get(
                        `https://graph.facebook.com/v19.0/${leadgenId}`,
                        { params: { access_token: accessToken } }
                    );

                    const lead = leadResp.data;
                    const fields: Record<string, string> = {};
                    for (const f of (lead.field_data || [])) {
                        fields[f.name] = f.values?.[0] || '';
                    }

                    const name = fields.full_name || fields.name || null;
                    const phone = fields.phone_number || fields.mobile || null;
                    const email = fields.email || null;
                    const city = fields.city || fields.location || null;
                    const budget = fields.budget || null;

                    const phoneNumber = normalizePhone(phone);
                    if (!phoneNumber) {
                        logger.warn(`[Facebook] Lead ${leadgenId} has no valid phone number`);
                        continue;
                    }

                    // Get tenant
                    const tenant = await prisma.tenant.findFirst();
                    if (!tenant) continue;

                    // Upsert contact
                    const contact = await prisma.contact.upsert({
                        where: { phone_number: phoneNumber },
                        update: {
                            name: name || undefined,
                            email: email || undefined,
                            source: 'facebook',
                            preferred_location: city || undefined,
                            last_channel: 'facebook',
                            last_interaction: new Date(),
                        },
                        create: {
                            phone_number: phoneNumber,
                            name,
                            email,
                            source: 'facebook',
                            contact_type: 'BUYER',
                            intent: 'buy',
                            preferred_location: city,
                            budget_max: budget ? parseFloat(String(budget).replace(/[^\d.]/g, '')) : null,
                            tenant_id: tenant.id,
                            last_channel: 'facebook',
                            last_interaction: new Date(),
                            lead_status: 'warm',
                        }
                    });

                    // Log interaction
                    await prisma.interaction.create({
                        data: {
                            tenant_id: tenant.id,
                            phone_number: phoneNumber,
                            channel: 'facebook',
                            direction: 'inbound',
                            event_type: 'lead_capture',
                            content: `Facebook Lead Ad: ${name || 'Unknown'} | Form: ${leadData.form_id || 'N/A'} | City: ${city || 'N/A'}`,
                            metadata: {
                                source: 'facebook',
                                leadgen_id: leadgenId,
                                form_id: leadData.form_id,
                                ad_id: leadData.ad_id,
                                original_fields: fields,
                            }
                        }
                    });

                    // Assign agent
                    const isNew = !contact.assigned_agent_id;
                    if (isNew) {
                        const agentId = await assignViaRoundRobin();
                        if (agentId) {
                            await prisma.contact.update({
                                where: { phone_number: phoneNumber },
                                data: { assigned_agent_id: agentId },
                            });
                            // Create workflow qualification task
                            const { createQualifyTask } = await import('../services/workflow_task_service');
                            createQualifyTask({ tenantId: tenant.id, contactPhone: phoneNumber, assignedTo: agentId, source: 'facebook' })
                                .catch(err => logger.warn('[Facebook] Workflow task failed:', (err as Error).message));
                        }
                    }

                    // Notify buyer (fire-and-forget)
                    sendBuyerConfirmationWhatsApp(phoneNumber, name, 'facebook')
                        .catch(err => logger.warn('[Facebook] Buyer WA failed:', err.message));
                    if (email) {
                        sendBuyerConfirmationEmail(email, name)
                            .catch(err => logger.warn('[Facebook] Buyer email failed:', err.message));
                    }

                    logger.info(`[Facebook] Lead captured: ${phoneNumber} (${name || 'unnamed'}) from form ${leadData.form_id}`);

                } catch (fetchErr: any) {
                    logger.error(`[Facebook] Failed to fetch lead ${leadgenId}: ${fetchErr.message}`);
                }
            }
        }
    } catch (error) {
        logger.error('[Facebook] Webhook processing error:', error);
    }
});

export default router;
