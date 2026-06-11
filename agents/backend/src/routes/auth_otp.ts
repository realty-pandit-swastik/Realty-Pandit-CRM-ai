import express from 'express';
import prisma from '../db';
import { WhatsAppService } from '../services/whatsapp';
import { normalizePhone, phoneVariants } from '../utils/phone';
import { captureRouteError } from '../utils/capture';

const router = express.Router();
const whatsappService = new WhatsAppService();

// Store pending authentications (in production, use Redis)
const pendingAuth = new Map<string, { sentAt: number; authenticated: boolean }>();

/**
 * POST /public/auth/send-confirmation
 * Send WhatsApp confirmation message - user replies "yes" or "agree" to connect
 */
router.post('/send-confirmation', async (req, res) => {
    try {
        const { phone } = req.body;

        const normalized = phone ? normalizePhone(phone) : '';
        if (!normalized || normalized.length !== 13) {
            return res.status(400).json({
                success: false,
                message: 'Valid phone number required (+91XXXXXXXXXX)',
            });
        }

        // Mark as pending authentication — store ALL variants so webhook can match
        pendingAuth.set(normalized, {
            sentAt: Date.now(),
            authenticated: false,
        });

        // Send confirmation message via WhatsApp (Meta-approved utility template)
        await whatsappService.sendTemplate(normalized, 'rp_whatsapp_link_v2', {});

        console.log(`✅ Confirmation request sent to ${normalized}`);

        // Find or create contact in SSOT
        let contact = await prisma.contact.findUnique({
            where: { phone_number: normalized },
        });

        if (!contact) {
            const tenant = await prisma.tenant.findFirst();
            if (tenant) {
                contact = await prisma.contact.create({
                    data: {
                        phone_number: normalized,
                        tenant_id: tenant.id,
                        contact_type: 'UNKNOWN',
                        source: 'website_chat',
                        last_channel: 'website',
                    },
                });
                console.log(`✅ Created new contact in SSOT: ${normalized}`);
            }
        }

        return res.json({
            success: true,
            message: 'Confirmation sent to WhatsApp',
        });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'auth_otp/send-confirmation' });
        return res.status(500).json({
            success: false,
            message: 'Failed to send confirmation',
            error: error.message,
        });
    }
});

/**
 * GET /public/auth/check-status
 * Check if user has replied with "yes" or "agree" on WhatsApp
 * Used for polling from frontend
 */
router.get('/check-status', async (req, res) => {
    try {
        const { phone } = req.query;

        if (!phone || typeof phone !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'Phone number required',
            });
        }

        const normalizedCheckPhone = normalizePhone(phone);
        const authStatus = pendingAuth.get(normalizedCheckPhone);

        if (!authStatus) {
            return res.json({
                success: true,
                authenticated: false,
                message: 'No pending authentication',
            });
        }

        // Check if authenticated
        if (authStatus.authenticated) {
            // Clean up after confirmation
            pendingAuth.delete(normalizedCheckPhone);

            return res.json({
                success: true,
                authenticated: true,
                message: 'Authenticated successfully',
            });
        }

        // Check if expired (10 minutes)
        const isExpired = Date.now() - authStatus.sentAt > 10 * 60 * 1000;
        if (isExpired) {
            pendingAuth.delete(normalizedCheckPhone);
            return res.json({
                success: true,
                authenticated: false,
                expired: true,
                message: 'Confirmation expired',
            });
        }

        return res.json({
            success: true,
            authenticated: false,
            message: 'Waiting for confirmation',
        });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'auth_otp/check-status' });
        return res.status(500).json({
            success: false,
            message: 'Failed to check status',
            error: error.message,
        });
    }
});

/**
 * Internal function to mark user as authenticated
 * Called from WhatsApp webhook when user replies "yes" or "agree"
 */
export function authenticateUser(phone: string): boolean {
    // Check all phone format variants since webhook normalizes to +91 but
    // pendingAuth may have been set with any format
    const variants = phoneVariants(phone);
    for (const v of variants) {
        const authStatus = pendingAuth.get(v);
        if (authStatus && !authStatus.authenticated) {
            authStatus.authenticated = true;
            pendingAuth.set(v, authStatus);
            console.log(`✅ User authenticated via WhatsApp: ${v}`);
            return true;
        }
    }

    return false;
}

export default router;
