
import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { AuthService } from '../services/auth';
import { authMiddleware, requireRole, checkPermission, setAuthCookies, clearAuthCookies } from '../middleware/auth';
import { generateCsrfToken, setCsrfCookie } from '../middleware/csrf';
import { getAllPermissions } from '../config/permissions';
import { validate } from '../validators';
import { loginSchema, registerSchema, refreshTokenSchema, setupSchema, forgotPasswordSchema, resetPasswordOtpSchema, setupPasswordSchema } from '../validators/auth.validator';
import prisma from '../db';
import logger from '../utils/logger';
import { normalizePhone } from '../utils/phone';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { sendOtp } from '../services/otp_sender';
import { captureRouteError } from '../utils/capture';

const router = Router();
const authService = new AuthService();
const ADMIN_PANEL_URL = process.env.ADMIN_PANEL_URL || 'https://admin.realtypandit.in';

// Redis OTP helpers (works across PM2 cluster instances, survives restarts)
const OTP_TTL = 600; // 10 minutes
const OTP_RATE_TTL = 600; // 10 minutes rate limit window
const OTP_MAX_SENDS = 3; // Max OTP sends per phone per window

async function storeOtp(phone: string, otp: string): Promise<void> {
    await cacheSet(`otp:reset:${phone}`, JSON.stringify({ otp, attempts: 0 }), OTP_TTL);
}

async function getStoredOtp(phone: string): Promise<{ otp: string; attempts: number } | null> {
    const data = await cacheGet(`otp:reset:${phone}`);
    if (!data) return null;
    try { return JSON.parse(data); } catch { return null; }
}

async function deleteOtp(phone: string): Promise<void> {
    await cacheDel(`otp:reset:${phone}`);
}

async function checkOtpRateLimit(phone: string): Promise<{ allowed: boolean; remaining: number }> {
    const key = `otp:rate:${phone}`;
    const countStr = await cacheGet(key);
    const count = countStr ? parseInt(countStr) : 0;
    if (count >= OTP_MAX_SENDS) {
        return { allowed: false, remaining: 0 };
    }
    await cacheSet(key, String(count + 1), OTP_RATE_TTL);
    return { allowed: true, remaining: OTP_MAX_SENDS - count - 1 };
}

// POST /auth/login — accepts phone + password
// Returns token in body (legacy clients) AND sets HttpOnly cookies (browser SPA).
router.post('/login', validate(loginSchema), async (req, res) => {
    const { phone, password } = req.body;
    const normalizedPhone = normalizePhone(phone);

    try {
        const result = await authService.loginByPhone(normalizedPhone, password);

        // Set HttpOnly access-token + refresh-token + CSRF cookies for browser SPA
        setAuthCookies(res, result.token, result.refreshToken);

        // Also return tokens in body for API / legacy clients during transition period
        res.json(result);
    } catch (error) {
        res.status(401).json({ error: (error as Error).message });
    }
});

// GET /auth/google — P1b: start "Sign in with Google" (PUBLIC).
// Top-level browser navigation, so a 302 to Google is correct here.
router.get('/google', async (req, res) => {
    try {
        const { isGoogleOAuthConfigured, signSignInState, buildSignInUrl } = await import('../services/google_oauth');
        if (!isGoogleOAuthConfigured()) {
            return res.redirect(`${ADMIN_PANEL_URL}/?login_error=google_unavailable`);
        }
        return res.redirect(buildSignInUrl(signSignInState()));
    } catch (err: any) {
        captureRouteError(err, req, { route: 'auth#google-start' });
        logger.error('[Auth] google sign-in start error:', err);
        return res.redirect(`${ADMIN_PANEL_URL}/?login_error=google_error`);
    }
});

// GET /auth/google/callback — P1b: Google sign-in redirect target (PUBLIC).
// Matches the OAuth client's registered sign-in redirect URI exactly.
router.get('/google/callback', async (req, res) => {
    try {
        const { code, state, error } = req.query || {};
        if (error) return res.redirect(`${ADMIN_PANEL_URL}/?login_error=google_denied`);
        if (!code || !state) return res.redirect(`${ADMIN_PANEL_URL}/?login_error=google_error`);

        const { verifySignInState, exchangeSignInCode } = await import('../services/google_oauth');

        try {
            verifySignInState(String(state));
        } catch {
            return res.redirect(`${ADMIN_PANEL_URL}/?login_error=google_expired`);
        }

        const email = await exchangeSignInCode(String(code));
        if (!email) return res.redirect(`${ADMIN_PANEL_URL}/?login_error=google_error`);

        let result;
        try {
            result = await authService.loginByGoogleEmail(email);
        } catch {
            // Not linked / inactive — send them back to phone login with a note.
            return res.redirect(`${ADMIN_PANEL_URL}/?login_error=google_unlinked`);
        }

        setAuthCookies(res, result.token, result.refreshToken);
        logger.info(`[Auth] Google sign-in OK for agent ${result.agent.id} (${email})`);
        return res.redirect(`${ADMIN_PANEL_URL}/?login=google`);
    } catch (err: any) {
        captureRouteError(err, req, { route: 'auth#google-callback' });
        logger.error('[Auth] google sign-in callback error:', err);
        return res.redirect(`${ADMIN_PANEL_URL}/?login_error=google_error`);
    }
});

// POST /auth/register — requires create_agents permission (super_boss + manager)
router.post('/register', authMiddleware, checkPermission('create_agents'), validate(registerSchema), async (req, res) => {
    const { name, email, password, role, reports_to_id } = req.body;

    // Role restriction: managers can only create employees
    const creatorRole = req.agent!.role;
    const targetRole = role || 'employee';
    if (creatorRole === 'manager' && targetRole !== 'employee') {
        return res.status(403).json({ error: 'Managers can only create employee accounts' });
    }
    if (creatorRole !== 'super_boss' && targetRole === 'super_boss') {
        return res.status(403).json({ error: 'Only super_boss can create another super_boss' });
    }

    try {
        const agent = await authService.register(name, email, password, targetRole, req.agent!.tenant_id, reports_to_id);
        res.status(201).json(agent);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// POST /auth/refresh
// Accepts refresh token from body (legacy) OR from the rp_refresh_token cookie (browser SPA).
router.post('/refresh', async (req, res) => {
    // Cookie-based clients send the refresh token as an HttpOnly cookie
    const cookieRefreshToken: string | undefined = req.cookies?.['rp_refresh_token'];
    // Legacy / API clients send it in the request body
    const bodyRefreshToken: string | undefined = req.body?.refreshToken;

    const refreshToken = cookieRefreshToken ?? bodyRefreshToken;

    if (!refreshToken) {
        return res.status(401).json({ error: 'Refresh token required' });
    }

    try {
        const result = await authService.refreshToken(refreshToken);

        // Refresh the access-token cookie and rotate the CSRF token
        setAuthCookies(res, result.token);

        res.json(result);
    } catch (error) {
        // Clear stale cookies so the client lands on the login page
        clearAuthCookies(res);
        res.status(401).json({ error: (error as Error).message });
    }
});

// POST /auth/logout — clear all auth cookies and invalidate the refresh token in DB
router.post('/logout', authMiddleware, async (req, res) => {
    try {
        // Invalidate stored refresh token so the old token can't be reused
        await prisma.agent.update({
            where: { id: req.agent!.id },
            data: { refresh_token: null },
        });

        logger.info(`[Auth] Agent ${req.agent!.id} logged out`);
    } catch {
        // Non-fatal — we still clear the cookies even if DB update fails
        logger.warn('[Auth] Could not clear refresh token from DB during logout');
    }

    clearAuthCookies(res);
    res.json({ success: true, message: 'Logged out successfully.' });
});

// GET /auth/csrf — issue a fresh CSRF token (called once on app boot by browser SPA)
router.get('/csrf', authMiddleware, (req, res) => {
    const token = generateCsrfToken();
    setCsrfCookie(res, token);
    res.json({ csrf_token: token });
});

// GET /auth/me - Get current user info
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const agent = await prisma.agent.findUnique({
            where: { id: req.agent!.id },
            select: {
                id: true, name: true, email: true, phone: true,
                role: true, department: true, status: true, tenant_id: true,
                last_login_at: true, reports_to_id: true,
                reports_to: { select: { name: true, email: true } },
                subordinates: { select: { id: true, name: true, email: true, role: true } }
            }
        });

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        res.json({
            ...agent,
            permissions: getAllPermissions(agent.role)
        });
    } catch (error) {
        captureRouteError(error, req, { route: 'auth/me' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /auth/setup - First-time setup (creates super_boss, no auth required)
router.post('/setup', validate(setupSchema), async (req, res) => {
    // Only works if no agents exist yet
    const count = await prisma.agent.count();
    if (count > 0) {
        return res.status(400).json({ error: 'Setup already completed. Use /auth/register to create new agents.' });
    }

    const { name, email, password } = req.body;

    try {
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) {
            return res.status(400).json({ error: 'No tenant found. Run seed first.' });
        }

        const agent = await authService.register(name, email, password, 'super_boss', tenant.id);
        const loginResult = await authService.login(email, password);
        setAuthCookies(res, loginResult.token, loginResult.refreshToken);
        res.status(201).json(loginResult);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// POST /auth/forgot-password — Send OTP to WhatsApp (no auth required)
router.post('/forgot-password', validate(forgotPasswordSchema), async (req, res) => {
    const { phone } = req.body;
    const normalizedPhone = normalizePhone(phone);

    try {
        // Rate limit check
        const rateCheck = await checkOtpRateLimit(normalizedPhone);
        if (!rateCheck.allowed) {
            return res.status(429).json({ error: 'Too many OTP requests. Please try again after 10 minutes.' });
        }

        // Look up agent by phone (active only)
        const agent = await prisma.agent.findFirst({
            where: { phone: normalizedPhone, status: 'active' },
            select: { id: true, name: true, email: true },
        });

        // Always return success (don't reveal if phone exists)
        if (!agent) {
            logger.warn(`[Auth] Forgot password attempt for unknown phone: ${normalizedPhone}`);
            return res.json({ message: 'If this phone is registered, you will receive an OTP.', remaining: rateCheck.remaining });
        }

        // Generate 6-digit OTP and store in Redis
        const otp = String(Math.floor(100000 + Math.random() * 900000));
        await storeOtp(normalizedPhone, otp);

        // Send OTP via WhatsApp + email (dual delivery)
        const result = await sendOtp({
            phone: normalizedPhone,
            email: agent.email,
            otp,
            purpose: 'password_reset',
            validMinutes: 10,
        });

        if (!result.anyDelivered) {
            return res.status(502).json({ error: 'Failed to send OTP. Please try again later.' });
        }

        logger.info(`[Auth] OTP sent to ${normalizedPhone} (wa: ${result.whatsappSent}, email: ${result.emailSent}, remaining: ${rateCheck.remaining})`);
        res.json({ message: result.message, remaining: rateCheck.remaining });
    } catch (error) {
        captureRouteError(error, req, { route: 'auth/forgot-password' });
        res.status(500).json({ error: 'Failed to send OTP. Please check your phone number and try again.' });
    }
});

// POST /auth/verify-reset-otp — Verify OTP and set new password (no auth required)
router.post('/verify-reset-otp', validate(resetPasswordOtpSchema), async (req, res) => {
    const { phone, otp, newPassword } = req.body;
    const normalizedPhone = normalizePhone(phone);

    try {
        const stored = await getStoredOtp(normalizedPhone);
        if (!stored || stored.otp !== otp) {
            return res.status(400).json({ error: 'Invalid OTP. Please try again.' });
        }

        // Find the agent
        const agent = await prisma.agent.findFirst({
            where: { phone: normalizedPhone, status: 'active' },
        });
        if (!agent) {
            return res.status(400).json({ error: 'No active account found for this phone.' });
        }

        // Update password
        const hash = await bcrypt.hash(newPassword, 10);
        await prisma.agent.update({
            where: { id: agent.id },
            data: { password_hash: hash },
        });

        // Clear OTP from Redis
        await deleteOtp(normalizedPhone);

        logger.info(`[Auth] Password reset successful for ${normalizedPhone} (agent: ${agent.name})`);
        res.json({ message: 'Password reset successfully. You can now login with your new password.' });
    } catch (error) {
        captureRouteError(error, req, { route: 'auth/verify-reset-otp' });
        res.status(500).json({ error: 'Failed to reset password. Please try again.' });
    }
});

// POST /auth/resend-otp — Resend OTP for password reset (no auth required)
router.post('/resend-otp', async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required.' });

    const normalizedPhone = normalizePhone(phone);

    try {
        // Rate limit check
        const rateCheck = await checkOtpRateLimit(normalizedPhone);
        if (!rateCheck.allowed) {
            return res.status(429).json({ error: 'Too many OTP requests. Please try again after 10 minutes.' });
        }

        // Look up agent by phone (active only)
        const agent = await prisma.agent.findFirst({
            where: { phone: normalizedPhone, status: 'active' },
            select: { id: true, name: true, email: true },
        });

        if (!agent) {
            return res.json({ message: 'If this phone is registered, you will receive an OTP.', remaining: rateCheck.remaining });
        }

        // Generate new OTP and store in Redis
        const otp = String(Math.floor(100000 + Math.random() * 900000));
        await storeOtp(normalizedPhone, otp);

        // Send OTP via WhatsApp + email (dual delivery)
        const result = await sendOtp({
            phone: normalizedPhone,
            email: agent.email,
            otp,
            purpose: 'password_reset',
            validMinutes: 10,
        });

        if (!result.anyDelivered) {
            return res.status(502).json({ error: 'Failed to resend OTP. Please try again later.' });
        }

        logger.info(`[Auth] OTP resent to ${normalizedPhone} (wa: ${result.whatsappSent}, email: ${result.emailSent}, remaining: ${rateCheck.remaining})`);
        res.json({ message: result.message, remaining: rateCheck.remaining });
    } catch (error) {
        captureRouteError(error, req, { route: 'auth/resend-otp' });
        res.status(500).json({ error: 'Failed to resend OTP. Please try again.' });
    }
});

// POST /auth/change-password — Change password for logged-in user
router.post('/change-password', authMiddleware, async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required.' });
    }

    if (newPassword.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }

    if (currentPassword === newPassword) {
        return res.status(400).json({ error: 'New password must be different from current password.' });
    }

    try {
        const agent = await prisma.agent.findUnique({
            where: { id: req.agent!.id },
            select: { id: true, password_hash: true, name: true },
        });

        if (!agent || !agent.password_hash) {
            return res.status(400).json({ error: 'Account not found or password not set.' });
        }

        const isValid = await bcrypt.compare(currentPassword, agent.password_hash);
        if (!isValid) {
            return res.status(401).json({ error: 'Current password is incorrect.' });
        }

        const hash = await bcrypt.hash(newPassword, 10);
        await prisma.agent.update({
            where: { id: agent.id },
            data: { password_hash: hash },
        });

        logger.info(`[Auth] Password changed by ${agent.name} (${agent.id})`);
        res.json({ success: true, message: 'Password changed successfully.' });
    } catch (error) {
        captureRouteError(error, req, { route: 'auth/change-password' });
        res.status(500).json({ error: 'Failed to change password. Please try again.' });
    }
});

// GET /auth/validate-setup-token — Check if a setup token is valid (public, no auth)
router.get('/validate-setup-token', async (req, res) => {
    const { token } = req.query;
    if (!token || typeof token !== 'string') {
        return res.status(400).json({ valid: false, error: 'Token is required' });
    }

    try {
        const agent = await prisma.agent.findFirst({
            where: {
                setup_token: token,
                setup_token_expires: { gt: new Date() },
                status: 'active',
            },
            select: { name: true, email: true },
        });

        if (!agent) {
            return res.json({ valid: false, error: 'Setup link has expired or is invalid. Please contact your admin.' });
        }

        res.json({ valid: true, name: agent.name, email: agent.email });
    } catch (error) {
        captureRouteError(error, req, { route: 'auth/validate-setup-token' });
        res.status(500).json({ valid: false, error: 'Failed to validate token' });
    }
});

// POST /auth/setup-password — Set password using setup token (public, no auth)
router.post('/setup-password', validate(setupPasswordSchema), async (req, res) => {
    const { token, password } = req.body;

    try {
        const agent = await prisma.agent.findFirst({
            where: {
                setup_token: token,
                setup_token_expires: { gt: new Date() },
                status: 'active',
            },
            select: { id: true, name: true, email: true },
        });

        if (!agent) {
            return res.status(400).json({ success: false, error: 'Setup link has expired or is invalid. Please contact your admin.' });
        }

        // Hash and set password, clear setup token (single-use)
        const hash = await bcrypt.hash(password, 10);
        await prisma.agent.update({
            where: { id: agent.id },
            data: {
                password_hash: hash,
                setup_token: null,
                setup_token_expires: null,
            },
        });

        logger.info(`[Auth] Password setup completed for ${agent.email} (${agent.name})`);
        res.json({ success: true, message: 'Password set successfully. You can now login.', email: agent.email });
    } catch (error) {
        captureRouteError(error, req, { route: 'auth/setup-password' });
        res.status(500).json({ success: false, error: 'Failed to set password. Please try again.' });
    }
});

export default router;
