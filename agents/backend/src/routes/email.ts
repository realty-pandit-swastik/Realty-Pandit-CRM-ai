/**
 * Email Routes - Webhook for incoming emails + Admin management
 * ALL emails processed by Panditji AI (ONE AI controls the system)
 */

import { Router, Request, Response } from 'express';
import { emailService } from '../services/email_service';
import { authMiddleware } from '../middleware/auth';
import logger from '../utils/logger';
import prisma from '../db';
import { captureRouteError } from '../utils/capture';

const router = Router();

/**
 * Webhook: Receive incoming email (called by Postfix pipe)
 * POST /api/email/webhook/incoming
 */
router.post('/webhook/incoming', async (req: Request, res: Response) => {
    try {
        const tenantId = process.env.DEFAULT_TENANT_ID || 'default';

        const { from, to, subject, text, html, messageId, inReplyTo, references, attachments } = req.body;

        if (!from || !to) {
            return res.status(400).json({ error: 'Missing required fields: from, to' });
        }

        logger.info('[Email Webhook] Received incoming email', { from, to, subject });

        // Process with Panditji AI
        const email = await emailService.processIncomingEmail({
            from,
            to,
            subject,
            text,
            html,
            messageId,
            inReplyTo,
            references,
            attachments
        }, tenantId);

        res.status(200).json({
            success: true,
            message: 'Email processed by Panditji AI',
            email_id: email.id
        });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'email#1' });
        logger.error('[Email Webhook] Error processing incoming email', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Send email (with optional AI generation)
 * POST /api/email/send
 */
router.post('/send', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { agent } = req as any;
        const tenantId = agent.tenant_id;

        const { to, from, subject, body, html, cc, bcc, generateWithAI } = req.body;

        if (!to) {
            return res.status(400).json({ error: 'Missing required field: to' });
        }

        // Look up sender's name and email from Agent table
        const senderAgent = await prisma.agent.findUnique({
            where: { id: agent.id },
            select: { name: true, email: true },
        });
        const senderEmail = senderAgent?.email || agent.email;
        const senderName = senderAgent?.name || 'Realty Pandit';

        const email = await emailService.sendEmail({
            from: from || `${senderName} <${senderEmail}>`,
            to,
            cc,
            bcc,
            subject,
            body,
            html,
            senderAgentId: agent.id, // T9b: use the agent's own mailbox if configured
        }, tenantId, generateWithAI || false);

        res.status(200).json({
            success: true,
            message: 'Email sent successfully',
            email
        });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'email#2' });
        logger.error('[Email API] Error sending email', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get emails for a contact
 * GET /api/email/contact/:phone
 */
router.get('/contact/:phone', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { phone } = req.params;
        const limit = parseInt(req.query.limit as string) || 50;

        const emails = await emailService.getEmailsForContact(phone, limit);

        res.status(200).json({ emails });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'email#3' });
        logger.error('[Email API] Error fetching emails', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Search emails
 * GET /api/email/search?q=...
 */
router.get('/search', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { agent } = req as any;
        const tenantId = agent.tenant_id;
        const query = req.query.q as string;
        const limit = parseInt(req.query.limit as string) || 50;

        if (!query) {
            return res.status(400).json({ error: 'Missing query parameter: q' });
        }

        const emails = await emailService.searchEmails(query, tenantId, limit);

        res.status(200).json({ emails, count: emails.length });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'email#4' });
        logger.error('[Email API] Error searching emails', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get all emails (paginated)
 * GET /api/email/all?page=1&limit=20
 */
router.get('/all', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { agent } = req as any;
        const tenantId = agent.tenant_id;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        // Optional direction filter: ?direction=inbound (inbox) or ?direction=outbound (sent)
        const directionFilter = req.query.direction as string;

        // Role-based email scoping: employees/managers see only their own emails
        let emailWhere: any = { tenant_id: tenantId };
        if (agent.role !== 'super_boss') {
            const senderAgent = await prisma.agent.findUnique({
                where: { id: agent.id },
                select: { email: true },
            });
            const agentEmail = senderAgent?.email || agent.email;
            emailWhere = {
                tenant_id: tenantId,
                OR: [
                    { from_email: { contains: agentEmail } },
                    { to_email: agentEmail },
                ],
            };
        }

        // Apply direction filter if provided
        if (directionFilter && ['inbound', 'outbound'].includes(directionFilter)) {
            emailWhere.direction = directionFilter;
        }

        const [emails, total] = await Promise.all([
            prisma.email.findMany({
                where: emailWhere,
                include: {
                    contact: {
                        select: {
                            phone_number: true,
                            name: true,
                            email: true,
                            contact_type: true
                        }
                    }
                },
                orderBy: { created_at: 'desc' },
                skip,
                take: limit
            }),
            prisma.email.count({
                where: emailWhere
            })
        ]);

        res.status(200).json({
            emails,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'email#5' });
        logger.error('[Email API] Error fetching all emails', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Delete email (Super Admin only)
 * DELETE /api/email/:id
 */
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { agent } = req as any;

        // Only super_boss can delete
        if (agent.role !== 'super_boss') {
            return res.status(403).json({ error: 'Forbidden: Only super admin can delete emails' });
        }

        const { id } = req.params;

        await prisma.email.delete({
            where: { id }
        });

        res.status(200).json({ success: true, message: 'Email deleted' });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'email#6' });
        logger.error('[Email API] Error deleting email', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Bulk send emails (Super Admin only)
 * POST /api/email/bulk-send
 */
router.post('/bulk-send', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { agent } = req as any;

        if (agent.role !== 'super_boss') {
            return res.status(403).json({ error: 'Forbidden: Only super admin can send bulk emails' });
        }

        const tenantId = agent.tenant_id;
        const { recipients, subject, body, html, generateWithAI } = req.body;

        if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
            return res.status(400).json({ error: 'recipients array is required' });
        }

        // Look up sender's name and email from Agent table
        const senderAgent = await prisma.agent.findUnique({
            where: { id: agent.id },
            select: { name: true, email: true },
        });
        const senderEmail = senderAgent?.email || agent.email;
        const senderName = senderAgent?.name || 'Realty Pandit';

        const results = [];
        for (const to of recipients) {
            try {
                const email = await emailService.sendEmail({
                    from: `${senderName} <${senderEmail}>`,
                    to,
                    subject,
                    body,
                    html
                }, tenantId, generateWithAI || false);
                results.push({ to, success: true, email_id: email.id });
            } catch (error: any) {
                results.push({ to, success: false, error: error.message });
            }
        }

        res.status(200).json({
            message: 'Bulk send completed',
            results,
            total: recipients.length,
            success: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length
        });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'email#7' });
        logger.error('[Email API] Error in bulk send', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
