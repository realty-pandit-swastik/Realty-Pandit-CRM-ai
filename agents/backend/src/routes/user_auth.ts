import express from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../db';
import { WhatsAppService } from '../services/whatsapp';
import { normalizePhone } from '../utils/phone';

const router = express.Router();
const whatsappService = new WhatsAppService();

// In-memory OTP storage (in production, use Redis)
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

// JWT secret for user authentication
const USER_JWT_SECRET = process.env.USER_JWT_SECRET || process.env.JWT_SECRET || 'user-jwt-secret';

/**
 * POST /user/login-otp
 * Send OTP to user's WhatsApp number
 */
router.post('/login-otp', async (req, res) => {
    try {
        const { phone } = req.body;

        // Validate phone number (E.164 format)
        const phoneRegex = /^(\+91|91)?[6-9]\d{9}$/;
        if (!phone || !phoneRegex.test(phone)) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid 10-digit Indian phone number',
            });
        }

        // Normalize phone number to E.164 format
        const normalizedPhone = normalizePhone(phone);

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Store OTP with 10-minute expiry
        otpStore.set(normalizedPhone, {
            otp,
            expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
        });

        // Send OTP via WhatsApp (Meta-approved authentication template)
        try {
            await whatsappService.sendTemplate(normalizedPhone, 'rp_user_otp', { otp });
        } catch (whatsappError) {
            console.error('WhatsApp send error:', whatsappError);
            // In development, continue even if WhatsApp fails
            if (process.env.NODE_ENV === 'production') {
                return res.status(500).json({
                    success: false,
                    message: 'Failed to send OTP. Please try again.',
                });
            }
        }

        // For development, also log OTP to console
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[DEV] OTP for ${normalizedPhone}: ${otp}`);
        }

        return res.json({
            success: true,
            message: 'OTP sent to your WhatsApp number',
            phone: normalizedPhone,
        });
    } catch (error: any) {
        console.error('Login OTP error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
});

/**
 * POST /user/verify-otp
 * Verify OTP and issue JWT token
 */
router.post('/verify-otp', async (req, res) => {
    try {
        const { phone, otp } = req.body;

        if (!phone || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Phone number and OTP are required',
            });
        }

        // Normalize phone number
        const normalizedPhone = normalizePhone(phone);

        // Check OTP
        const storedOTP = otpStore.get(normalizedPhone);
        if (!storedOTP) {
            return res.status(400).json({
                success: false,
                message: 'OTP not found. Please request a new OTP.',
            });
        }

        // Check expiry
        if (Date.now() > storedOTP.expiresAt) {
            otpStore.delete(normalizedPhone);
            return res.status(400).json({
                success: false,
                message: 'OTP expired. Please request a new OTP.',
            });
        }

        // Verify OTP
        if (storedOTP.otp !== otp) {
            return res.status(400).json({
                success: false,
                message: 'Invalid OTP. Please try again.',
            });
        }

        // OTP verified - clear from store
        otpStore.delete(normalizedPhone);

        // Find or create contact (SSOT pattern)
        let contact = await prisma.contact.findUnique({
            where: { phone_number: normalizedPhone },
        });

        if (!contact) {
            // Create new contact with type BUYER
            contact = await prisma.contact.create({
                data: {
                    phone_number: normalizedPhone,
                    contact_type: 'BUYER',
                    source: 'website_login',
                    last_channel: 'website',
                },
            });
        } else {
            // Update last interaction
            await prisma.contact.update({
                where: { id: contact.id },
                data: {
                    last_channel: 'website',
                    last_interaction: new Date(),
                },
            });
        }

        // Log interaction
        await prisma.interaction.create({
            data: {
                contact_id: contact.id,
                direction: 'inbound',
                channel: 'website_login',
                event_type: 'login',
                metadata: {
                    login_method: 'otp',
                    phone: normalizedPhone,
                },
            },
        });

        // Generate JWT token (7-day expiry)
        const token = jwt.sign(
            {
                id: contact.id,
                phone: contact.phone_number,
                type: 'user',
                contact_type: contact.contact_type,
            },
            USER_JWT_SECRET,
            { expiresIn: '7d' }
        );

        return res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: contact.id,
                phone: contact.phone_number,
                name: contact.name,
                email: contact.email,
                contact_type: contact.contact_type,
            },
        });
    } catch (error: any) {
        console.error('Verify OTP error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
});

/**
 * GET /user/me
 * Get current user info (requires JWT authentication)
 */
router.get('/me', async (req, res) => {
    try {
        // Extract token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized - No token provided',
            });
        }

        const token = authHeader.substring(7);

        // Verify token
        let decoded: any;
        try {
            decoded = jwt.verify(token, USER_JWT_SECRET);
        } catch (err) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized - Invalid token',
            });
        }

        // Get user from database
        const contact = await prisma.contact.findUnique({
            where: { id: decoded.id },
            include: {
                scheduled_visits: {
                    orderBy: { created_at: 'desc' },
                    take: 10,
                },
                interactions: {
                    orderBy: { created_at: 'desc' },
                    take: 20,
                },
            },
        });

        if (!contact) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        // Get saved searches (from localStorage metadata in interactions)
        const savedSearches = contact.interactions
            .filter((i) => i.event_type === 'property_search' && i.metadata)
            .slice(0, 5);

        return res.json({
            success: true,
            user: {
                id: contact.id,
                phone: contact.phone_number,
                name: contact.name,
                email: contact.email,
                contact_type: contact.contact_type,
                intent: contact.intent,
                preferred_location: contact.preferred_location,
                budget: contact.budget,
                created_at: contact.created_at,
            },
            savedSearches: savedSearches.map((s) => s.metadata),
            scheduledVisits: contact.scheduled_visits.map((v) => ({
                id: v.id,
                property_id: v.property_id,
                preferred_date: v.preferred_date,
                preferred_time: v.preferred_time,
                status: v.status,
                created_at: v.created_at,
            })),
            recentActivity: contact.interactions.slice(0, 10).map((i) => ({
                type: i.event_type,
                channel: i.channel,
                timestamp: i.created_at,
                metadata: i.metadata,
            })),
        });
    } catch (error: any) {
        console.error('Get user error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
});

/**
 * POST /user/logout
 * Logout user (client-side token removal, server can blacklist token if needed)
 */
router.post('/logout', (req, res) => {
    // In a simple JWT implementation, logout is handled client-side by removing the token
    // For production, you might want to maintain a token blacklist in Redis

    return res.json({
        success: true,
        message: 'Logged out successfully',
    });
});

export default router;
