import express from 'express';
import { ChatHandler } from '../services/chat_handler';
import prisma from '../db';
import { WhatsAppService } from '../services/whatsapp';
import { cacheSet, cacheGet } from '../utils/redis';

const whatsappService = new WhatsAppService();

const router = express.Router();
const chatHandler = new ChatHandler();

/**
 * POST /public/ai-chat
 * Process user message with AI and return response with matching properties
 * FEATURE 3: Now logs all messages to Interaction table for WhatsApp continuity
 */
router.post('/ai-chat', async (req, res) => {
    try {
        console.log('🔥 [AI Chat] Route HIT! Body:', req.body);
        const { message, filters, sessionId, phone } = req.body;

        // Validate input
        if (!message || typeof message !== 'string') {
            console.log('❌ [AI Chat] Validation failed - no message');
            return res.status(400).json({
                success: false,
                error: 'Message is required',
            });
        }

        console.log(`📨 [AI Chat] Processing message: "${message}"`);
        // Process message through chat handler
        const result = await chatHandler.processMessage(message, filters || {}, sessionId);
        console.log('✅ [AI Chat] Got result:', { reply: result.reply?.substring(0, 50), properties: result.properties?.length });

        // FEATURE 3: Log user message to Interaction table if phone is available
        if (phone) {
            const normalizedPhone = phone.startsWith('+') ? phone : `+91${phone.replace(/^91/, '')}`;

            try {
                // Get tenant for interaction logging
                const tenant = await prisma.tenant.findFirst();
                if (!tenant) throw new Error('No tenant configured');

                // Log user message
                await prisma.interaction.create({
                    data: {
                        tenant_id: tenant.id,
                        phone_number: normalizedPhone,
                        direction: 'inbound',
                        channel: 'website_chat',
                        event_type: 'message',
                        content: message,
                        metadata: {
                            sessionId: result.sessionId,
                            filters,
                        },
                    },
                });

                // Log AI response
                await prisma.interaction.create({
                    data: {
                        tenant_id: tenant.id,
                        phone_number: normalizedPhone,
                        direction: 'outbound',
                        channel: 'website_chat',
                        event_type: 'message',
                        content: result.reply,
                        metadata: {
                            sessionId: result.sessionId,
                            propertiesCount: result.properties?.length || 0,
                            action: result.action,
                        },
                    },
                });

                console.log(`✅ Logged website chat messages for ${normalizedPhone}`);
            } catch (logError) {
                console.error('Error logging chat messages:', logError);
                // Don't fail the request if logging fails
            }
        }

        return res.json({
            success: true,
            ...result,
        });
    } catch (error: any) {
        console.error('AI Chat error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to process message',
            message: error.message,
        });
    }
});

/**
 * POST /public/ai-chat/book-visit
 * Handle property visit booking from chat
 */
router.post('/ai-chat/book-visit', async (req, res) => {
    try {
        const { phone, propertyId, message, sessionId } = req.body;

        // Validate input
        if (!phone || !propertyId) {
            return res.status(400).json({
                success: false,
                error: 'Phone number and property ID are required',
            });
        }

        // Process booking through chat handler
        const result = await chatHandler.handleBooking(phone, propertyId, message, sessionId);

        return res.json({
            success: true,
            ...result,
        });
    } catch (error: any) {
        console.error('Booking error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to process booking',
            message: error.message,
        });
    }
});

/**
 * POST /public/auth/send-confirmation
 * Send WhatsApp OTP for phone number verification (website chat login).
 */
router.post('/auth/send-confirmation', async (req, res) => {
    try {
        const { phoneNumber } = req.body;

        // Validate phone number
        if (!phoneNumber || typeof phoneNumber !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Phone number is required',
            });
        }

        // Validate E.164 format (starts with +, followed by country code and number)
        const e164Pattern = /^\+[1-9]\d{1,14}$/;
        if (!e164Pattern.test(phoneNumber)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid phone number format. Use E.164 format (e.g., +919876543210)',
            });
        }

        // Generate 6-digit OTP and store in Redis (10-minute TTL)
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpKey = `website_otp:${phoneNumber}`;
        await cacheSet(otpKey, otp, 600); // 10 minutes

        console.log(`📱 [Auth] OTP generated for ${phoneNumber}`);

        // Send via WhatsApp
        const waPhone = phoneNumber.replace(/^\+/, '');
        try {
            await whatsappService.sendText(
                waPhone,
                `Your Realty Pandit verification code is: *${otp}*\n\nValid for 10 minutes. Do not share this code.`
            );
        } catch (waErr: any) {
            console.error('[Auth] WhatsApp OTP send failed:', waErr.message);
            // Don't fail the request — OTP is stored, user can try again
        }

        return res.json({
            success: true,
            message: 'Confirmation code sent to your WhatsApp',
        });
    } catch (error: any) {
        console.error('Send confirmation error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to send confirmation code',
            message: error.message,
        });
    }
});

/**
 * POST /public/auth/verify-confirmation
 * Verify the WhatsApp OTP sent by send-confirmation.
 */
router.post('/auth/verify-confirmation', async (req, res) => {
    try {
        const { phoneNumber, code } = req.body;

        if (!phoneNumber || !code) {
            return res.status(400).json({ success: false, error: 'phoneNumber and code are required' });
        }

        const otpKey = `website_otp:${phoneNumber}`;
        const storedOtp = await cacheGet(otpKey);

        if (!storedOtp || storedOtp !== code) {
            return res.status(400).json({ success: false, error: 'Invalid or expired verification code' });
        }

        // OTP valid — remove it so it can't be reused
        await cacheSet(otpKey, '', 1); // expire immediately

        return res.json({ success: true, message: 'Phone number verified successfully' });
    } catch (error: any) {
        console.error('Verify confirmation error:', error);
        return res.status(500).json({ success: false, error: 'Failed to verify code', message: error.message });
    }
});

export default router;
