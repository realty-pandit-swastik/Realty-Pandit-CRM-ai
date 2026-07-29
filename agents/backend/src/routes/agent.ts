
import { Router } from 'express';
import prisma from '../db';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { CommissionService } from '../services/commission';
import { permissionEngine, maskPhone, maskName, viewerFromPartner, applyRoleMaskList } from '../services/permission_engine';
import { sanitizationService } from '../services/sanitization_service';
import { validate } from '../validators';
import { agentLoginOtpSchema, agentVerifyOtpSchema, agentRegisterSchema, closeDealSchema } from '../validators/calls.validator';
import logger from '../utils/logger';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { normalizePhone } from '../utils/phone';
import { registerLimiter } from '../middleware/rate_limit';
import { foldLegacyDemand, mergeDemandSchemaValues } from '../utils/demand_canonical';
import { sendOtp } from '../services/otp_sender';
import { ensureOwner } from '../services/ensure_owner';
import { StorageService } from '../services/storage';
import { setAuthCookies } from '../middleware/auth';

const storageService = new StorageService();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime', 'video/x-msvideo', 'application/pdf'];
        cb(null, allowed.includes(file.mimetype));
    }
});

const commissionService = new CommissionService();

// OTP helpers for partner agent auth
const AGENT_OTP_TTL = 300; // 5 minutes
const AGENT_OTP_RATE_TTL = 600; // 10 min rate window
const AGENT_OTP_MAX_SENDS = 5;

async function storeAgentOtp(phone: string, otp: string): Promise<void> {
    await cacheSet(`otp:agent:${phone}`, JSON.stringify({ otp }), AGENT_OTP_TTL);
}

async function getAgentOtp(phone: string): Promise<string | null> {
    const data = await cacheGet(`otp:agent:${phone}`);
    if (!data) return null;
    try { return JSON.parse(data).otp; } catch { return null; }
}

async function deleteAgentOtp(phone: string): Promise<void> {
    await cacheDel(`otp:agent:${phone}`);
}

async function checkAgentOtpRate(phone: string): Promise<{ allowed: boolean; remaining: number }> {
    const key = `otp:agent:rate:${phone}`;
    const countStr = await cacheGet(key);
    const count = countStr ? parseInt(countStr) : 0;
    if (count >= AGENT_OTP_MAX_SENDS) return { allowed: false, remaining: 0 };
    await cacheSet(key, String(count + 1), AGENT_OTP_RATE_TTL);
    return { allowed: true, remaining: AGENT_OTP_MAX_SENDS - count - 1 };
}

const router = Router();
const JWT_SECRET = process.env.AGENT_JWT_SECRET!;
// 2026-07-12: partners now log into the SAME admin app. Their session token is signed with the
// ADMIN secret + role:'partner' so admin `authMiddleware` recognizes it (the admin app's /auth/me
// then returns a partner-scoped identity). The default-deny guard locks partners to the allow-list.
const ADMIN_JWT_SECRET = process.env.JWT_SECRET!;
async function signPartnerAdminSession(agent: { id: string; email?: string | null; phone_number: string; partner_category?: string | null; parent_partner_id?: string | null }): Promise<string> {
    const tenant = await prisma.tenant.findFirst({ select: { id: true } });
    return jwt.sign(
        {
            id: agent.id,
            email: agent.email || '',
            role: 'partner',
            tenant_id: tenant?.id,
            phone: agent.phone_number,
            partner_category: agent.partner_category,
            parent_partner_id: agent.parent_partner_id,
        },
        ADMIN_JWT_SECRET,
        { expiresIn: '7d' },
    );
}

// Middleware for Agent Auth
// Accepts the JWT from EITHER the Authorization: Bearer <token> header OR the
// rp_access_token HttpOnly cookie set by setAuthCookies on verify-otp / login-password.
// The cookie path makes the web partner portal work without having to expose the
// token to JS; Bearer remains available for non-browser clients.
const authenticateAgent = async (req: any, res: any, next: any) => {
    const headerToken = req.headers.authorization?.split(' ')[1];
    const cookieToken = req.cookies?.rp_access_token;
    const token = headerToken || cookieToken;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: string; phone: string };
        req.agentId = decoded.id;
        next();
    } catch (err) {
        captureRouteError(err, req, { route: 'agent#1' });
        return res.status(403).json({ error: 'Invalid token' });
    }
};

// 1. Auth: Send OTP via WhatsApp
router.post('/login-otp', validate(agentLoginOtpSchema), async (req, res) => {
    const phone = normalizePhone(req.body.phone);
    if (!phone) {
        return res.status(400).json({ error: 'Invalid phone number' });
    }

    try {
        // Rate limit
        const rateCheck = await checkAgentOtpRate(phone);
        if (!rateCheck.allowed) {
            return res.status(429).json({ error: 'Too many OTP requests. Please try again after 10 minutes.' });
        }

        // Check if partner agent exists
        const agent = await prisma.partnerAgent.findUnique({ where: { phone_number: phone } });
        if (!agent) {
            return res.status(404).json({ error: 'No partner account found for this number. Please contact your coordinator.' });
        }

        // Generate 6-digit OTP
        const otp = String(Math.floor(100000 + Math.random() * 900000));
        await storeAgentOtp(phone, otp);

        // Send OTP via WhatsApp + email (dual delivery)
        const result = await sendOtp({
            phone,
            email: agent.email,
            otp,
            purpose: 'login',
            validMinutes: 5,
        });

        if (!result.anyDelivered) {
            return res.status(502).json({ error: 'Failed to send OTP. Please try again later.' });
        }

        logger.info(`[AgentAuth] OTP sent to ${phone} (wa: ${result.whatsappSent}, email: ${result.emailSent})`);
        res.json({ message: result.message, remaining: rateCheck.remaining });
    } catch (error) {
        captureRouteError(error, req, { route: 'agent#2' });
        logger.error('[AgentAuth] OTP send error:', error);
        res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
    }
});

// 2. Auth: Verify OTP
router.post('/verify-otp', validate(agentVerifyOtpSchema), async (req, res) => {
    const phone = normalizePhone(req.body.phone);
    const { otp } = req.body;
    if (!phone) {
        return res.status(400).json({ error: 'Invalid phone number' });
    }

    try {
        // Validate OTP from Redis
        const storedOtp = await getAgentOtp(phone);
        if (!storedOtp || storedOtp !== otp) {
            return res.status(400).json({ error: 'Invalid or expired OTP. Please request a new one.' });
        }

        // Clear OTP after successful verification
        await deleteAgentOtp(phone);

        // Partner must already exist (registered by admin/coordinator)
        const agent = await prisma.partnerAgent.findUnique({
            where: { phone_number: phone },
            include: {
                managing_agent: { select: { id: true, name: true, phone: true, email: true } }
            }
        });

        if (!agent) {
            return res.status(404).json({ error: 'No partner account found. Please contact your coordinator.' });
        }

        // SECURITY (2026-07-12): OTP verify had NO status check — a SUSPENDED/EXPIRED partner could log in.
        // Now that a partner session grants access to the admin app, only ACTIVE partners may sign in
        // (matches the /agent/login-password guard).
        if (agent.status !== 'ACTIVE') {
            logger.warn(`[AgentAuth] Blocked OTP sign-in for non-ACTIVE partner ${agent.id} (status=${agent.status})`);
            return res.status(403).json({ error: 'Your partner account is not active. Please contact your coordinator.' });
        }

        const hasPassword = !!agent.password_hash;

        const token = await signPartnerAdminSession(agent);
        setAuthCookies(res, token);

        res.json({
            token,
            agent: {
                id: agent.id,
                name: agent.name,
                package: agent.package_type,
                partner_category: agent.partner_category,
                parent_partner_id: agent.parent_partner_id,
                business_name: agent.business_name,
                has_password: hasPassword,
                coordinator: agent.managing_agent ? {
                    name: agent.managing_agent.name,
                    phone: agent.managing_agent.phone,
                    email: agent.managing_agent.email
                } : null
            }
        });
    } catch (error) {
        captureRouteError(error, req, { route: 'agent#3' });
        logger.error('[AgentAuth] Verify OTP error:', error);
        res.status(500).json({ error: 'Verification failed. Please try again.' });
    }
});

// 3. Register (Public)
router.post('/register', registerLimiter, validate(agentRegisterSchema), async (req, res) => {
    // Honeypot (2026-07-29): real users never fill `website`; form-scraping bots do.
    if (req.body.website) return res.status(400).json({ error: 'Registration failed. Please try again.' });
    const { name, email, companyName } = req.body;
    const phone = normalizePhone(String(req.body.phone || '')); // store canonical +91XXXXXXXXXX

    try {
        // Ensure Contact exists
        let contact = await prisma.contact.findUnique({ where: { phone_number: phone } });
        if (!contact) {
            const tenant = await prisma.tenant.findFirst();
            if (!tenant) return res.status(500).json({ error: 'System not configured: no tenant found' });
            contact = await prisma.contact.create({
                data: {
                    phone_number: phone,
                    tenant_id: tenant.id,
                    name: name,
                    email: email,
                    contact_type: 'PARTNER_AGENT',
                    source: 'agent_registration',
                    created_by: req.agent?.id || null,
                }
            });
        } else {
            // Update contact type
            await prisma.contact.update({
                where: { phone_number: phone },
                data: { contact_type: 'PARTNER_AGENT', name: name, email: email }
            });
        }

        // Self-signup ownership rule (2026-04-17 middleman model, Stage-2 lock):
        // When a partner registers via /join/agent (no internal team member involved),
        // they are assigned to the super_boss by default. Super_boss can reassign later.
        const superBoss = await prisma.agent.findFirst({
            where: { role: 'super_boss', status: 'active' },
            select: { id: true },
        });

        const agent = await prisma.partnerAgent.create({
            data: {
                phone_number: phone,
                name,
                email,
                company_name: companyName,
                package_type: 'FREE',
                status: 'ACTIVE',
                managing_agent_id: superBoss?.id ?? null,
                onboarded_by_agent_id: superBoss?.id ?? null,
                onboarded_at: new Date(),
                partner_type: 'BOTH',
            }
        });

        res.json({ message: 'Registration successful', agentId: agent.id });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'agent#4' });
        logger.error(err);
        res.status(500).json({ error: 'Registration failed ' + err.message });
    }
});

// 3b. Login with Password
router.post('/login-password', async (req, res) => {
    const phone = normalizePhone(req.body.phone);
    const { password } = req.body;
    if (!phone || !password) {
        return res.status(400).json({ error: 'Phone and password are required' });
    }

    try {
        const agent = await prisma.partnerAgent.findUnique({
            where: { phone_number: phone },
            include: {
                managing_agent: { select: { id: true, name: true, phone: true, email: true } }
            }
        });

        if (!agent || !agent.password_hash) {
            return res.status(401).json({ error: 'Invalid credentials. If you haven\'t set a password, login with OTP first.' });
        }

        const valid = await bcrypt.compare(password, agent.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (agent.status !== 'ACTIVE') {
            return res.status(403).json({ error: 'Account is not active. Contact your coordinator.' });
        }

        const token = await signPartnerAdminSession(agent);
        setAuthCookies(res, token);

        res.json({
            token,
            agent: {
                id: agent.id,
                name: agent.name,
                package: agent.package_type,
                partner_category: agent.partner_category,
                parent_partner_id: agent.parent_partner_id,
                business_name: agent.business_name,
                has_password: true,
                coordinator: agent.managing_agent ? {
                    name: agent.managing_agent.name,
                    phone: agent.managing_agent.phone,
                    email: agent.managing_agent.email
                } : null
            }
        });
    } catch (error) {
        captureRouteError(error, req, { route: 'agent#5' });
        logger.error('[AgentAuth] Password login error:', error);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
});

// 3c. Set/Update Password (authenticated)
router.post('/set-password', authenticateAgent, async (req: any, res) => {
    const { password, current_password } = req.body;
    if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        const agent = await prisma.partnerAgent.findUnique({ where: { id: req.agentId } });
        if (!agent) return res.status(404).json({ error: 'Agent not found' });

        // If password already set, require current password
        if (agent.password_hash) {
            if (!current_password) {
                return res.status(400).json({ error: 'Current password is required to change password' });
            }
            const valid = await bcrypt.compare(current_password, agent.password_hash);
            if (!valid) {
                return res.status(401).json({ error: 'Current password is incorrect' });
            }
        }

        const hash = await bcrypt.hash(password, 10);
        await prisma.partnerAgent.update({
            where: { id: req.agentId },
            data: { password_hash: hash }
        });

        res.json({ message: 'Password set successfully. You can now login with your password.' });
    } catch (error) {
        captureRouteError(error, req, { route: 'agent#6' });
        logger.error('[AgentAuth] Set password error:', error);
        res.status(500).json({ error: 'Failed to set password' });
    }
});

// 3d. Get Coordinator Info (authenticated)
router.get('/coordinator', authenticateAgent, async (req: any, res) => {
    try {
        const agent = await prisma.partnerAgent.findUnique({
            where: { id: req.agentId },
            include: {
                managing_agent: { select: { name: true, phone: true, email: true } }
            }
        });
        if (!agent) return res.status(404).json({ error: 'Agent not found' });

        res.json({
            coordinator: agent.managing_agent ? {
                name: agent.managing_agent.name,
                phone: agent.managing_agent.phone,
                email: agent.managing_agent.email
            } : null
        });
    } catch (error) {
        captureRouteError(error, req, { route: 'agent#7' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// Helper: collect all owner IDs for an agent + their sub-agents (team members)
async function getAgentOwnerIds(agentId: string, phoneNumber: string): Promise<string[]> {
    // Sub-agents (team members) under this agent
    const subAgents = await prisma.partnerAgent.findMany({
        where: { parent_partner_id: agentId },
        select: { phone_number: true },
    });
    const allPhones = [phoneNumber, ...subAgents.map((sa: { phone_number: string }) => sa.phone_number)];
    const owners = await prisma.owner.findMany({
        where: { contact_phone: { in: allPhones } },
        select: { id: true },
    });
    return owners.map((o: { id: string }) => o.id);
}

/**
 * 2026-05-15: Build the full where-OR a partner agent should see in their portal.
 * A piece of inventory belongs to a partner when ANY of these are true:
 *   1. owner_id points to an owner whose contact_phone matches them (or sub-agent)
 *   2. key_holder_phone matches them (or sub-agent) — they have the keys
 *   3. referral_partner_id matches them (or sub-agent) — they referred it
 *
 * Previously the portal only checked (1), so inventory uploaded by admin
 * on-behalf-of a partner where the partner was only the key-holder was
 * invisible. Audit on 2026-05-15 found 12 such inventories across 5 partners.
 */
async function getAgentInventoryWhere(agentId: string, phoneNumber: string): Promise<any> {
    const subAgents = await prisma.partnerAgent.findMany({
        where: { parent_partner_id: agentId },
        select: { id: true, phone_number: true },
    });
    const allPhones = [phoneNumber, ...subAgents.map((sa: { phone_number: string }) => sa.phone_number)];
    const allAgentIds = [agentId, ...subAgents.map((sa: { id: string }) => sa.id)];

    // key_holder_phone in DB is stored bare 10-digit (e.g., "8700493013"), but agent.phone_number
    // is full E.164 (e.g., "+918700493013"). Generate both variants.
    const phoneVariants: string[] = [];
    for (const p of allPhones) {
        if (!p) continue;
        phoneVariants.push(p);
        if (p.startsWith('+91')) phoneVariants.push(p.slice(3));
        else if (p.startsWith('91') && p.length === 12) phoneVariants.push(p.slice(2));
    }

    const owners = await prisma.owner.findMany({
        where: { contact_phone: { in: allPhones } },
        select: { id: true },
    });
    const ownerIds = owners.map((o: { id: string }) => o.id);

    const orClauses: any[] = [];
    if (ownerIds.length > 0) orClauses.push({ owner_id: { in: ownerIds } });
    if (phoneVariants.length > 0) orClauses.push({ key_holder_phone: { in: phoneVariants } });
    if (allAgentIds.length > 0) orClauses.push({ referral_partner_id: { in: allAgentIds } });

    return orClauses.length > 0 ? { OR: orClauses } : { id: '__never_match__' };
}

// 4. Dashboard Stats
router.get('/dashboard', authenticateAgent, async (req: any, res) => {
    const agentId = req.agentId;

    const agent = await prisma.partnerAgent.findUnique({ where: { id: agentId } });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    // 2026-05-15: now includes key-holder + referral inventory, not just owner-linked
    const baseWhere = await getAgentInventoryWhere(agentId, agent.phone_number);

    const activeListings = await prisma.inventory.count({
        where: { ...baseWhere, status: 'active' }
    });

    const totalListings = await prisma.inventory.count({
        where: baseWhere
    });

    const visits = await prisma.scheduledVisit.count({
        where: { agent_id: agentId }
    });

    res.json({
        activeListings,
        totalListings,
        totalEnquiries: visits,
        visitsScheduled: visits,
    });
});

// 4b. Commissions (List) — the partner's OWN commission entries (payee = them or a sub-agent).
// Phase 1 partner portal (2026-07-11). Scoped by partner_agent_id → a partner can only ever see
// their own earnings. DealCommissionEntry has no paid/pending status, so we report total earned + list.
router.get('/commissions', authenticateAgent, async (req: any, res) => {
    try {
        const agentId = req.agentId;
        const subAgents = await prisma.partnerAgent.findMany({
            where: { parent_partner_id: agentId }, select: { id: true },
        });
        const ids = [agentId, ...subAgents.map((s: { id: string }) => s.id)];

        const entries = await prisma.dealCommissionEntry.findMany({
            where: { party_type: 'PARTNER_AGENT', partner_agent_id: { in: ids } },
            orderBy: { entered_at: 'desc' },
            select: {
                id: true, amount: true, currency: true, notes: true, entered_at: true,
                transaction: { select: { id: true, status: true, demand_location: true } },
            },
        });

        const total = entries.reduce((s: number, e: any) => s + Number(e.amount), 0);
        res.json({
            total_earned: total,
            currency: entries[0]?.currency || 'INR',
            count: entries.length,
            entries: entries.map((e: any) => ({
                id: e.id,
                amount: Number(e.amount),
                currency: e.currency,
                notes: e.notes,
                earned_at: e.entered_at,
                deal_id: e.transaction?.id || null,
                deal_status: e.transaction?.status || null,
                location: e.transaction?.demand_location || null,
            })),
        });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'agent#commissions' });
        logger.error('[AgentCommissions] Error:', error);
        res.status(500).json({ error: 'Failed to fetch commissions' });
    }
});

// 4c. Notifications (bell) — partner-scoped in-app notifications. (2026-07-12)
router.get('/notifications', authenticateAgent, async (req: any, res) => {
    try {
        const agentId = req.agentId;
        const items = await prisma.notification.findMany({
            where: { recipient_type: 'partner', recipient_id: agentId },
            orderBy: { created_at: 'desc' },
            take: 50,
            select: { id: true, event: true, category: true, title: true, body: true, action_url: true, read: true, created_at: true },
        });
        res.json({ notifications: items, unread: items.filter((n: { read: boolean }) => !n.read).length });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'agent#notifications' });
        res.status(500).json({ error: err.message });
    }
});

// POST /agent/notifications/read — mark one (by id) or all as read.
router.post('/notifications/read', authenticateAgent, async (req: any, res) => {
    try {
        const agentId = req.agentId;
        const id = req.body?.id;
        await prisma.notification.updateMany({
            where: { recipient_type: 'partner', recipient_id: agentId, ...(id ? { id: String(id) } : {}) },
            data: { read: true },
        });
        res.json({ success: true });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'agent#notifications-read' });
        res.status(500).json({ error: err.message });
    }
});

// 5. Inventory (List)
router.get('/inventory', authenticateAgent, async (req: any, res) => {
    const agentId = req.agentId;

    const agent = await prisma.partnerAgent.findUnique({ where: { id: agentId } });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    // 2026-05-15: include inventory linked by ANY of: owner, key_holder, or referral
    const baseWhere = await getAgentInventoryWhere(agentId, agent.phone_number);

    const items = await prisma.inventory.findMany({
        where: baseWhere,
        orderBy: { created_at: 'desc' },
        select: {
            id: true,
            display_id: true,
            intent: true,
            category: true,
            type: true,
            location: true,
            price: true,
            price_unit: true,
            specs: true,
            status: true,
            media_urls: true,
            description: true,
            floor_number: true,
            // furnishing/total_floors/facing/property_age dropped Phase 4 (2026-05-28) —
            // read from specs.furnishing/floors/facing/['age-of-construction'] instead.
            uploader_phone: true,
            uploader_name: true,
            owner_phone: true,
            created_at: true,
        }
    });
    res.json(items);
});

// 5a. Inventory (Browse all) — masked cross-partner search (middleman model, 2026-04-17)
// Partners can self-search inventory platform-wide; owner/source/exact-address stripped.
// Filters: city, locality, property type, BHK, budget range.
router.get('/inventory/browse', authenticateAgent, async (req: any, res) => {
    const partnerId: string = req.agentId;
    const viewer = viewerFromPartner(partnerId);

    const {
        city, locality, type, bhk,
        budget_min, budget_max,
        intent,
        page = '1', limit = '20',
    } = req.query as Record<string, string>;

    const where: any = { status: 'active' };
    if (city) where.city = city;
    if (locality) where.locality = { contains: locality, mode: 'insensitive' };
    if (type) where.type = type;
    if (intent) where.intent = intent;
    if (bhk) {
        const bhkNum = parseInt(bhk, 10);
        if (!isNaN(bhkNum)) {
            where.specs = { path: ['bedrooms'], equals: bhkNum };
        }
    }
    if (budget_min || budget_max) {
        where.price = {};
        if (budget_min) where.price.gte = parseFloat(budget_min);
        if (budget_max) where.price.lte = parseFloat(budget_max);
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    // Fetch full rows. The SanitizationService strips owner/source/exact-address fields
    // based on the viewer — this is the single source of truth for what the partner sees.
    const [rows, total] = await Promise.all([
        prisma.inventory.findMany({
            where,
            orderBy: [{ media_score: 'desc' }, { created_at: 'desc' }],
            skip: (pageNum - 1) * limitNum,
            take: limitNum,
        }),
        prisma.inventory.count({ where }),
    ]);

    const sanitized = applyRoleMaskList(rows as any[], viewer);
    res.json({ rows: sanitized, total, page: pageNum, limit: limitNum });
});

// 5b. Inventory (Create) — Partner adds property from their dashboard
router.post('/inventory', authenticateAgent, async (req: any, res) => {
    const agentId = req.agentId;

    try {
        const agent = await prisma.partnerAgent.findUnique({ where: { id: agentId } });
        if (!agent) return res.status(404).json({ error: 'Agent not found' });

        // 2026-05-15: Listing limit removed — business model changed to commission-on-sale,
        // not subscription-tier. Partners can upload unlimited inventory free of cost. The
        // listing_limit column is retained on the schema (set to 99999) for backward compat
        // but no longer enforced anywhere. Subscription-expiry cron is also disabled.

        const {
            intent, location, price, price_unit, description,
            category, type, furnishing, floor_number, total_floors,
            facing, property_age, specs,
            // Address fields
            state, district, locality, sub_locality, pincode, full_address,
            apartment_name, flat_no, plot_no,
            // Geo
            latitude, longitude,
            // Amenities & source
            features, lead_reference,
            // Media
            video_urls,
        } = req.body;

        if (!intent) return res.status(400).json({ error: 'Intent is required (sell / rent)' });
        if (!sub_locality && !locality && !full_address) return res.status(400).json({ error: 'At minimum a locality or address is required' });

        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return res.status(500).json({ error: 'Tenant configuration missing' });

        // Ensure Owner exists for this partner
        const ownerId = await ensureOwner(agent.phone_number, tenant.id);

        // specs.* is the SoT for type-specific fields (2026-05-28). The furnishing/facing/
        // property_age/total_floors/features COLUMNS were dropped — fold incoming values into
        // specs under canonical keys instead of writing the (now non-existent) columns, which
        // would throw `Unknown argument`. Mirrors workflows/workflow_engine.ts §14.
        const mergedSpecs: Record<string, any> = { ...(specs && typeof specs === 'object' ? specs : {}) };
        if (furnishing) mergedSpecs.furnishing = furnishing;
        if (facing) mergedSpecs.facing = facing;
        if (property_age) mergedSpecs['age-of-construction'] = property_age;
        if (total_floors) mergedSpecs.floors = parseInt(String(total_floors)) || undefined;
        if (Array.isArray(features) && features.length) mergedSpecs.amenities = features;

        const inventory = await prisma.inventory.create({
            data: {
                tenant_id: tenant.id,
                owner_id: ownerId,
                owner_phone: agent.phone_number,
                intent,
                category: category || 'residential',
                type: type || 'flat',
                location: sub_locality || locality || district || location || full_address || '',
                price: price ? parseFloat(String(price)) : null,
                price_unit: price_unit || 'Lakh',
                // specs holds furnishing/facing/age-of-construction/floors/amenities (folded above).
                specs: (Object.keys(mergedSpecs).length ? mergedSpecs : null) as any,
                // Partner dashboard uploads require coordinator approval before going live
                status: 'pending_approval',
                media_urls: [],
                video_urls: Array.isArray(video_urls) ? video_urls : [],
                description: description || null,
                floor_number: floor_number ? parseInt(String(floor_number)) : null,
                // Address
                state: state || null,
                district: district || null,
                sub_locality: sub_locality || null,
                locality: locality || null,
                pincode: pincode || null,
                full_address: full_address || null,
                apartment_name: apartment_name || null,
                flat_no: flat_no || null,
                plot_no: plot_no || null,
                // Geo
                latitude: latitude ? parseFloat(String(latitude)) : null,
                longitude: longitude ? parseFloat(String(longitude)) : null,
                // Source
                lead_reference: lead_reference || null,
                upload_source: 'mobile_app',
                uploader_phone: agent.phone_number,
                uploader_name: agent.name,
            },
        });

        logger.info(`[AgentInventory] Partner ${agentId} created inventory ${inventory.id}`);
        res.status(201).json(inventory);
    } catch (error) {
        captureRouteError(error, req, { route: 'agent#8' });
        logger.error('[AgentInventory] Create error:', error);
        res.status(500).json({ error: 'Failed to create property listing' });
    }
});

// 5c. Inventory Media Upload — Partner uploads photos/videos after creating listing
router.post('/inventory/:id/upload', authenticateAgent, upload.array('files', 20), async (req: any, res) => {
    try {
        const { id } = req.params;
        const agentId = req.agentId;
        const files = req.files as Express.Multer.File[];

        if (!files || files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

        // Verify this inventory belongs to this agent
        const agent = await prisma.partnerAgent.findUnique({ where: { id: agentId } });
        if (!agent) return res.status(404).json({ error: 'Agent not found' });

        const inventory = await prisma.inventory.findUnique({ where: { id } });
        if (!inventory) return res.status(404).json({ error: 'Inventory not found' });

        // Primary check: owner ID match
        const owner = await prisma.owner.findUnique({ where: { contact_phone: agent.phone_number } });
        const isOwnerById = owner && inventory.owner_id === owner.id;

        // Fallback check: phone-based ownership (handles phone format variants)
        const { phoneVariants } = await import('../utils/phone');
        const variants = phoneVariants(agent.phone_number);
        const isUploaderByPhone = variants.some((v: string) => v === inventory.uploader_phone || v === inventory.owner_phone);

        if (!isOwnerById && !isUploaderByPhone) {
            return res.status(403).json({ error: 'Not authorized to upload to this listing' });
        }

        const imageUrls: string[] = [];
        const videoUrls: string[] = [];

        for (const file of files) {
            if (file.mimetype.startsWith('video/')) {
                // Store video directly to disk (no sharp processing)
                const videoDir = require('path').join(process.cwd(), 'uploads', 'properties', id);
                require('fs').mkdirSync(videoDir, { recursive: true });
                const ext = file.mimetype === 'video/mp4' ? '.mp4' : file.mimetype === 'video/quicktime' ? '.mov' : '.avi';
                const filename = `${Date.now()}${ext}`;
                require('fs').writeFileSync(require('path').join(videoDir, filename), file.buffer);
                videoUrls.push(`/uploads/properties/${id}/${filename}`);
            } else {
                const result = await storageService.uploadImage(file, id);
                imageUrls.push(result.original);
            }
        }

        const updatedMedia = [...(inventory.media_urls || []), ...imageUrls];
        const updatedVideos = [...(inventory.video_urls || []), ...videoUrls];

        await prisma.inventory.update({
            where: { id },
            data: { media_urls: updatedMedia, video_urls: updatedVideos },
        });

        logger.info(`[AgentMedia] Partner ${agentId} uploaded ${files.length} files to ${id}`);
        res.json({ message: `${files.length} file(s) uploaded`, media_urls: updatedMedia, video_urls: updatedVideos });
    } catch (error) {
        captureRouteError(error, req, { route: 'agent#9' });
        logger.error('[AgentMedia] Upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// 5d. GET /agent/inventory — Partner views their own listings
router.get('/inventory', authenticateAgent, async (req: any, res) => {
    try {
        const agentId = req.agentId;
        const agent = await prisma.partnerAgent.findUnique({ where: { id: agentId } });
        if (!agent) return res.status(404).json({ error: 'Agent not found' });

        const { phoneVariants } = await import('../utils/phone');
        const variants = phoneVariants(agent.phone_number);

        const items = await prisma.inventory.findMany({
            where: {
                OR: [
                    { owner_phone: { in: variants } },
                    { uploader_phone: { in: variants } },
                ],
            },
            orderBy: { created_at: 'desc' },
            select: {
                id: true, display_id: true, status: true, intent: true,
                type: true, category: true, location: true,
                full_address: true, locality: true, district: true, state: true,
                price: true, price_unit: true, display_price: true,
                specs: true, media_urls: true, video_urls: true,
                description: true, created_at: true,
                flat_no: true, floor_number: true, apartment_name: true,
            },
        });
        res.json(items);
    } catch (error) {
        captureRouteError(error, req, { route: 'agent#10' });
        logger.error('[AgentInventory] List error:', error);
        res.status(500).json({ error: 'Failed to fetch listings' });
    }
});

// 5e. PATCH /agent/inventory/:id — Partner edits their own listing
router.patch('/inventory/:id', authenticateAgent, async (req: any, res) => {
    try {
        const { id } = req.params;
        const agentId = req.agentId;
        const agent = await prisma.partnerAgent.findUnique({ where: { id: agentId } });
        if (!agent) return res.status(404).json({ error: 'Agent not found' });

        const { phoneVariants } = await import('../utils/phone');
        const variants = phoneVariants(agent.phone_number);

        const existing = await prisma.inventory.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Listing not found' });

        // Ownership check
        const isOwner = variants.some(v => v === existing.owner_phone || v === existing.uploader_phone);
        if (!isOwner) return res.status(403).json({ error: 'Not authorized to edit this listing' });

        // furnishing/facing/property_age/total_floors/features columns were dropped (2026-05-28)
        // — they live in specs.* now and are folded in below, NOT written as columns.
        const allowed = ['price', 'price_unit', 'description', 'specs', 'floor_number', 'flat_no', 'plot_no',
            'apartment_name', 'sub_locality', 'locality', 'district', 'state', 'pincode', 'full_address',
            'latitude', 'longitude'];
        const updateData: any = {};
        for (const field of allowed) {
            if (req.body[field] !== undefined) {
                if (field === 'price') updateData[field] = req.body[field] !== null && req.body[field] !== '' ? parseFloat(req.body[field]) : null;
                else if (field === 'floor_number') updateData[field] = req.body[field] !== null && req.body[field] !== '' ? parseInt(String(req.body[field])) : null;
                else if (['latitude', 'longitude'].includes(field)) updateData[field] = req.body[field] !== null && req.body[field] !== '' ? parseFloat(req.body[field]) : null;
                else updateData[field] = req.body[field];
            }
        }

        // Fold dropped-column fields into specs.* (deep-merge over existing so we don't clobber).
        const specBase: Record<string, any> = (updateData.specs && typeof updateData.specs === 'object')
            ? updateData.specs
            : ((existing.specs && typeof existing.specs === 'object') ? { ...(existing.specs as any) } : {});
        let specTouched = updateData.specs !== undefined;
        if (req.body.furnishing !== undefined) { specBase.furnishing = req.body.furnishing; specTouched = true; }
        if (req.body.facing !== undefined) { specBase.facing = req.body.facing; specTouched = true; }
        if (req.body.property_age !== undefined) { specBase['age-of-construction'] = req.body.property_age; specTouched = true; }
        if (req.body.total_floors !== undefined) { specBase.floors = (req.body.total_floors !== null && req.body.total_floors !== '') ? parseInt(String(req.body.total_floors)) : undefined; specTouched = true; }
        if (Array.isArray(req.body.features)) { specBase.amenities = req.body.features; specTouched = true; }
        if (specTouched) updateData.specs = specBase;

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        // Editing an approved listing → back to pending_approval for re-review
        if (existing.status === 'active') {
            updateData.status = 'pending_approval';
        }

        const updated = await prisma.inventory.update({ where: { id }, data: updateData });
        logger.info(`[AgentInventory] Partner ${agentId} updated listing ${id}`);
        res.json(updated);
    } catch (error) {
        captureRouteError(error, req, { route: 'agent#11' });
        logger.error('[AgentInventory] Update error:', error);
        res.status(500).json({ error: 'Failed to update listing' });
    }
});

// 5f. DELETE /agent/inventory/:id — Partner withdraws/deletes their own listing
router.delete('/inventory/:id', authenticateAgent, async (req: any, res) => {
    try {
        const { id } = req.params;
        const agentId = req.agentId;
        const agent = await prisma.partnerAgent.findUnique({ where: { id: agentId } });
        if (!agent) return res.status(404).json({ error: 'Agent not found' });

        const { phoneVariants } = await import('../utils/phone');
        const variants = phoneVariants(agent.phone_number);

        const existing = await prisma.inventory.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Listing not found' });

        // Ownership check
        const isOwner = variants.includes(existing.owner_phone || '') || variants.includes(existing.uploader_phone || '');
        if (!isOwner) return res.status(403).json({ error: 'Not authorized to delete this listing' });

        if (existing.status === 'active') {
            // Active listings: soft-delete (withdraw) rather than hard delete
            await prisma.inventory.update({ where: { id }, data: { status: 'withdrawn' } });
            logger.info(`[AgentInventory] Partner ${agentId} withdrew active listing ${id}`);
            res.json({ message: 'Listing withdrawn successfully', id });
        } else {
            // pending_approval / withdrawn: hard delete
            await prisma.inventory.delete({ where: { id } });
            logger.info(`[AgentInventory] Partner ${agentId} deleted listing ${id}`);
            res.json({ message: 'Listing deleted successfully', id });
        }
    } catch (error) {
        captureRouteError(error, req, { route: 'agent#12' });
        logger.error('[AgentInventory] Delete error:', error);
        res.status(500).json({ error: 'Failed to delete listing' });
    }
});

// 5g. DELETE /agent/inventory/:id/media/:filename — Partner removes a specific media file
router.delete('/inventory/:id/media/:filename', authenticateAgent, async (req: any, res) => {
    try {
        const { id, filename } = req.params;
        const agentId = req.agentId;
        const agent = await prisma.partnerAgent.findUnique({ where: { id: agentId } });
        if (!agent) return res.status(404).json({ error: 'Agent not found' });

        const { phoneVariants } = await import('../utils/phone');
        const variants = phoneVariants(agent.phone_number);

        const inv = await prisma.inventory.findUnique({ where: { id }, select: { uploader_phone: true, owner_phone: true, media_urls: true, video_urls: true } });
        if (!inv) return res.status(404).json({ error: 'Listing not found' });

        const isOwner = variants.some(v => v === inv.uploader_phone || v === inv.owner_phone);
        if (!isOwner) return res.status(403).json({ error: 'Not authorized' });

        const ext = filename.split('.').pop()?.toLowerCase() || '';
        const isVideo = ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext);

        if (isVideo) {
            const newVideoUrls = inv.video_urls.filter(u => !u.includes(filename));
            await prisma.inventory.update({ where: { id }, data: { video_urls: newVideoUrls } });
        } else {
            try { storageService.deleteMedia(id, filename); } catch { /* file may not exist on disk */ }
            const newMediaUrls = inv.media_urls.filter(u => !u.includes(filename));
            await prisma.inventory.update({ where: { id }, data: { media_urls: newMediaUrls } });
        }

        logger.info(`[AgentMedia] Partner ${agentId} deleted media ${filename} from ${id}`);
        res.json({ success: true });
    } catch (error) {
        captureRouteError(error, req, { route: 'agent#13' });
        logger.error('[AgentMedia] Delete media error:', error);
        res.status(500).json({ error: 'Failed to delete media' });
    }
});

// 6. Leads (With Masking)
// PHASE 13: Updated to use PermissionEngine for data masking
router.get('/leads', authenticateAgent, async (req: any, res) => {
    const agentId = req.agentId;

    // Get agent's owner record for permission check
    const agent = await prisma.partnerAgent.findUnique({
        where: { id: agentId },
        include: {
            contact: {
                include: {
                    owner: true
                }
            }
        }
    });

    if (!agent || !agent.contact?.owner) {
        return res.status(404).json({ error: 'Agent owner record not found. Please complete migration.' });
    }

    const ownerId = agent.contact.owner.id;

    // Get data masking rules from permission engine
    const maskingRules = await permissionEngine.getDataMaskingRules(ownerId);

    // Find visits/leads assigned to this agent's properties
    const visits = await prisma.scheduledVisit.findMany({
        where: { agent_id: agentId },
        orderBy: { created_at: 'desc' }
    });

    // Transform and apply masking based on permissions
    const leads = visits.map(v => {
        return {
            id: v.id,
            name: maskingRules.maskName ? maskName(v.name || '') : v.name,
            phone: maskingRules.maskPhone ? maskPhone(v.phone) : v.phone,
            interest: 'Property Visit',
            status: v.status,
            date: v.created_at,
            isMasked: maskingRules.maskPhone
        };
    });

    res.json(leads);
});

// ── REFERRED LEADS (leads the partner referred to Realty Pandit) ──────────────

// GET /agent/referred-leads
router.get('/referred-leads', authenticateAgent, async (req: any, res) => {
    try {
        const agentId = req.agentId;
        const leads = await prisma.contact.findMany({
            where: { referral_partner_id: agentId },
            select: {
                phone_number: true, name: true, email: true,
                lead_status: true, lifecycle_stage: true, lead_type: true,
                source: true, intent: true,
                budget_min: true, budget_max: true, demand_schema_values: true,
                preferred_location: true, timeline: true, notes: true,
                created_at: true, updated_at: true,
                assigned_agent: { select: { name: true } },
            },
            orderBy: { created_at: 'desc' },
        });
        res.json(leads);
    } catch (err: any) {
        captureRouteError(err, req, { route: 'agent#14' });
        res.status(500).json({ error: err.message });
    }
});

// PATCH /agent/referred-leads/:phone — partner can update client details & requirements
router.patch('/referred-leads/:phone', authenticateAgent, async (req: any, res) => {
    try {
        const agentId = req.agentId;
        const phone = decodeURIComponent(req.params.phone);

        // Verify this lead belongs to this partner
        const contact = await prisma.contact.findFirst({
            where: { phone_number: phone, referral_partner_id: agentId },
        });
        if (!contact) return res.status(404).json({ error: 'Lead not found or not yours' });
        if (contact.lead_status === 'partner_closed') return res.status(400).json({ error: 'Lead is already marked as done' });

        const { name, phone: newPhone, email, intent, budget_min, budget_max,
            demand_bhk, preferred_location, timeline, notes } = req.body;

        const updateData: any = {};
        if (name !== undefined) updateData.name = name || null;
        if (email !== undefined) updateData.email = email || null;
        if (intent !== undefined) updateData.intent = intent || null;
        if (budget_min !== undefined) updateData.budget_min = budget_min || null;
        if (budget_max !== undefined) updateData.budget_max = budget_max || null;
        // demand_bhk column was DROPPED in the 2026-05-29 demand unification — fold it into the
        // canonical demand_schema_values (deep-merged onto existing) instead of writing the
        // non-existent column (which threw "Unknown argument `demand_bhk`" → route 500).
        if (demand_bhk !== undefined) {
            const folded = foldLegacyDemand({ demand_bhk: demand_bhk ? Number(demand_bhk) : null });
            const merged = mergeDemandSchemaValues((contact as any).demand_schema_values, folded.demand_schema_values);
            if (merged) updateData.demand_schema_values = merged;
        }
        if (preferred_location !== undefined) updateData.preferred_location = preferred_location || null;
        if (timeline !== undefined) updateData.timeline = timeline || null;
        if (notes !== undefined) updateData.notes = notes || null;

        // Phone number change — only if currently TEMP_ or blank
        if (newPhone && contact.phone_number.startsWith('TEMP_')) {
            const { normalizePhone } = await import('../utils/phone');
            const normalized = normalizePhone(newPhone);
            // Move to new phone_number (primary key change — delete + create)
            const updated = await prisma.$transaction(async (tx) => {
                const copy = await tx.contact.create({
                    data: { ...contact, ...updateData, phone_number: normalized, updated_at: new Date() },
                });
                await tx.contact.delete({ where: { phone_number: contact.phone_number } });
                return copy;
            });
            return res.json(updated);
        }

        const updated = await prisma.contact.update({
            where: { phone_number: phone },
            data: { ...updateData, updated_at: new Date() },
        });
        res.json(updated);
    } catch (err: any) {
        captureRouteError(err, req, { route: 'agent#15' });
        res.status(500).json({ error: err.message });
    }
});

// POST /agent/referred-leads/:phone/done — partner marks lead as closed on their end
router.post('/referred-leads/:phone/done', authenticateAgent, async (req: any, res) => {
    try {
        const agentId = req.agentId;
        const phone = decodeURIComponent(req.params.phone);

        const contact = await prisma.contact.findFirst({
            where: { phone_number: phone, referral_partner_id: agentId },
            include: {
                assigned_agent: { select: { id: true, name: true, phone: true, email: true } },
            },
        });
        if (!contact) return res.status(404).json({ error: 'Lead not found or not yours' });
        if (contact.lead_status === 'partner_closed') return res.status(400).json({ error: 'Already marked as done' });

        // Get partner agent info
        const partner = await prisma.partnerAgent.findUnique({
            where: { id: agentId },
            select: { name: true, phone_number: true },
        });

        // Update lead status
        await prisma.contact.update({
            where: { phone_number: phone },
            data: { lead_status: 'partner_closed', updated_at: new Date() },
        });

        // Log an interaction
        await prisma.interaction.create({
            data: {
                phone_number: phone,
                channel: 'system',
                direction: 'inbound',
                event_type: 'partner_closed',
                content: `Partner ${partner?.name || agentId} marked this lead as done — handled with their own inventory`,
                tenant_id: contact.tenant_id,
            },
        });

        // Notify: super_boss + assigned agent
        const { notify } = await import('../services/notify');
        const notifyData = {
            partner_name: partner?.name || 'Partner',
            client_name: contact.name || contact.phone_number,
            client_phone: contact.phone_number,
        };

        const recipients: any[] = [];
        // Super boss
        const superBoss = await prisma.agent.findFirst({ where: { role: 'super_boss', status: 'active' } });
        if (superBoss) {
            recipients.push({ id: superBoss.id, type: 'agent', phone: superBoss.phone, email: superBoss.email, name: superBoss.name });
        }
        // Assigned agent (if different from super boss)
        if (contact.assigned_agent && contact.assigned_agent.id !== superBoss?.id) {
            recipients.push({ id: contact.assigned_agent.id, type: 'agent', phone: contact.assigned_agent.phone, email: contact.assigned_agent.email, name: contact.assigned_agent.name });
        }

        if (recipients.length > 0) {
            await notify('partner_lead_closed', recipients, notifyData);
        }

        res.json({ success: true, message: 'Lead marked as done' });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'agent#16' });
        res.status(500).json({ error: err.message });
    }
});

// 7. Appointments
// PHASE 13: Updated to use PermissionEngine for data masking
router.get('/appointments', authenticateAgent, async (req: any, res) => {
    const agentId = req.agentId;

    // Get agent's owner record for permission check
    const agent = await prisma.partnerAgent.findUnique({
        where: { id: agentId },
        include: {
            contact: {
                include: {
                    owner: true
                }
            }
        }
    });

    if (!agent || !agent.contact?.owner) {
        return res.status(404).json({ error: 'Agent owner record not found. Please complete migration.' });
    }

    const ownerId = agent.contact.owner.id;

    // Get data masking rules from permission engine
    const maskingRules = await permissionEngine.getDataMaskingRules(ownerId);

    const visits = await prisma.scheduledVisit.findMany({
        where: { agent_id: agentId, status: { in: ['confirmed', 'custom'] } },
        orderBy: { preferred_date: 'asc' }
    });

    const data = visits.map(v => {
        return {
            id: v.id,
            buyer: maskingRules.maskName ? maskName(v.name || '') : v.name,
            phone: maskingRules.maskPhone ? maskPhone(v.phone) : v.phone,
            date: v.preferred_date,
            time: v.preferred_time,
            status: v.status
        };
    });

    res.json(data);
});

// 8. Close Deal (Trigger Commission)
router.post('/visits/:id/close', authenticateAgent, validate(closeDealSchema), async (req: any, res) => {
    const { dealValue } = req.body;
    const visitId = req.params.id;

    try {
        await prisma.scheduledVisit.update({
            where: { id: visitId },
            data: { status: 'completed' }
        });

        const result = await commissionService.processDealClosure(visitId, Number(dealValue));
        res.json({ success: true, commission: result });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'agent#17' });
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// TEAM MANAGEMENT (Company partners can add sub-agents)
// ============================================================

// GET /agent/team - List sub-agents (company partners only)
router.get('/team', authenticateAgent, async (req: any, res) => {
    try {
        const caller = await prisma.partnerAgent.findUnique({ where: { id: req.agentId } });
        if (!caller || caller.partner_category !== 'COMPANY' || caller.parent_partner_id) {
            return res.status(403).json({ error: 'Only company partner owners can manage team' });
        }

        const subAgents = await prisma.partnerAgent.findMany({
            where: { parent_partner_id: caller.id },
            orderBy: { created_at: 'desc' },
            select: {
                id: true, name: true, phone_number: true, email: true,
                status: true, created_at: true
            }
        });
        res.json(subAgents);
    } catch (err: any) {
        captureRouteError(err, req, { route: 'agent#18' });
        res.status(500).json({ error: err.message });
    }
});

// POST /agent/team - Add a sub-agent (company partners only)
router.post('/team', authenticateAgent, async (req: any, res) => {
    const { name, phone, email } = req.body;
    if (!name || !phone) {
        return res.status(400).json({ error: 'name and phone are required' });
    }

    try {
        const caller = await prisma.partnerAgent.findUnique({ where: { id: req.agentId } });
        if (!caller || caller.partner_category !== 'COMPANY' || caller.parent_partner_id) {
            return res.status(403).json({ error: 'Only company partner owners can add team members' });
        }

        const normalizedPhone = phone.startsWith('+') ? phone : `+91${phone.replace(/^0+/, '')}`;

        // Ensure contact exists
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return res.status(500).json({ error: 'System not configured' });

        await prisma.contact.upsert({
            where: { phone_number: normalizedPhone },
            create: {
                phone_number: normalizedPhone,
                tenant_id: tenant.id,
                name,
                email: email || undefined,
                contact_type: 'PARTNER_AGENT',
                source: 'partner_team_created',
                created_by: req.agent?.id || null,
            },
            update: { name, contact_type: 'PARTNER_AGENT' }
        });

        const subAgent = await prisma.partnerAgent.create({
            data: {
                phone_number: normalizedPhone,
                name,
                email: email || null,
                partner_category: 'INDIVIDUAL',
                parent_partner_id: caller.id,
                managing_agent_id: caller.managing_agent_id,
                business_name: caller.business_name,
                business_address: caller.business_address,
                package_type: caller.package_type,
                status: 'ACTIVE',
                verified: true,
                onboarded_at: new Date()
            }
        });

        res.status(201).json(subAgent);
    } catch (err: any) {
        captureRouteError(err, req, { route: 'agent#19' });
        if (err.code === 'P2002') {
            return res.status(409).json({ error: 'This phone number is already registered' });
        }
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// DEAL MANAGEMENT (Phase 7 - Partner-facing deal endpoints)
// ============================================================

import { createDeal, listDeals, getDealById, getDealTimeline } from '../services/deal_service';
import { partnerCreateDealSchema, createDealQuerySchema } from '../validators/deals.validator';
import { captureRouteError } from '../utils/capture';

// POST /agent/deals — Partner submits a buyer lead as a deal
router.post('/deals', authenticateAgent, validate(partnerCreateDealSchema), async (req: any, res) => {
    try {
        const agentId = req.agentId;
        const agent = await prisma.partnerAgent.findUnique({ where: { id: agentId } });
        if (!agent) return res.status(404).json({ error: 'Agent not found' });

        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return res.status(500).json({ error: 'System not configured' });

        const { customer_name, customer_phone, type: rawType, ...requirements } = req.body;
        // Map user-friendly type to DB enum (BUY→SALE, RENT→RENT, LEASE→RENT)
        const type = rawType === 'BUY' ? 'SALE' : rawType === 'LEASE' ? 'RENT' : rawType;

        // Upsert contact for the customer if phone provided
        let contactId: string;
        // Conflict: the partner submitted a phone that ALREADY belongs to one of OUR direct clients
        // (a non-partner contact not already attributed to any partner). The partner is "claiming" a
        // client we already hold → the lead is parked PENDING_PARTNER_CLAIM for a RealtyPandit team
        // member to approve (credit the partner) or reject (stays our direct client).
        let pendingPartnerClaim = false;
        if (customer_phone) {
            const phone = customer_phone.startsWith('+') ? customer_phone : `+91${customer_phone.replace(/^0+/, '')}`;
            const existing = await prisma.contact.findUnique({
                where: { phone_number: phone },
                select: { phone_number: true, referral_partner_id: true, contact_type: true },
            });
            if (existing && existing.contact_type !== 'PARTNER_AGENT' && !existing.referral_partner_id) {
                pendingPartnerClaim = true;
            }
            const contact = await prisma.contact.upsert({
                where: { phone_number: phone },
                create: {
                    phone_number: phone,
                    tenant_id: tenant.id,
                    name: customer_name || null,
                    contact_type: type === 'RENT' ? 'TENANT' : 'BUYER',
                    source: 'partner_deal',
                    created_by: req.agent?.id || null,
                },
                // Existing direct client: do NOT overwrite their name on a pending claim.
                update: pendingPartnerClaim ? {} : { name: customer_name || undefined },
            });
            contactId = contact.phone_number;
        } else {
            // No client phone → unique, non-dialable PENDING- placeholder key (recognized by
            // isPlaceholderPhone / toDialablePhone so it never leaks into tel:/wa.me links). Mirrors
            // the admin create path; replaces the legacy `partner_lead_<ts>` format the guards missed.
            const partnerKey = String(agent.phone_number || 'partner').replace(/[^0-9a-zA-Z]/g, '').slice(-10) || 'partner';
            const placeholder = `PENDING-${partnerKey}-${Date.now().toString(36)}${Math.floor(Math.random() * 10000)}`;
            const contact = await prisma.contact.create({
                data: {
                    phone_number: placeholder,
                    tenant_id: tenant.id,
                    name: customer_name || null,
                    contact_type: type === 'RENT' ? 'TENANT' : 'BUYER',
                    source: 'partner_deal',
                    created_by: req.agent?.id || null,
                },
            });
            contactId = contact.phone_number;
        }

        const result = await createDeal(
            {
                tenant_id: tenant.id,
                demand_contact_id: contactId,
                demand_handler_type: 'PARTNER',
                demand_handler_id: agentId,
                type,
                source: 'partner_portal',
                ...requirements,
            },
            agentId,
            'partner_portal'
        );

        if (result.isDuplicate) {
            return res.status(409).json({ error: 'Duplicate deal detected', existing_deal_id: result.deal.id });
        }

        // Park a claim on one of our existing direct clients: flag the contact + audit trail. The admin
        // "Partner Approvals" queue (verification_status='PENDING_PARTNER_CLAIM') surfaces it for approve/reject.
        if (pendingPartnerClaim) {
            await prisma.contact.update({
                where: { phone_number: contactId },
                data: { verification_status: 'PENDING_PARTNER_CLAIM', updated_at: new Date() },
            });
            await prisma.interaction.create({
                data: {
                    tenant_id: tenant.id,
                    phone_number: contactId,
                    channel: 'partner_portal',
                    direction: 'inbound',
                    event_type: 'partner_claim_pending',
                    content: `Partner ${agent.name || agentId} submitted a lead for an existing direct client — awaiting approval.`,
                    metadata: { partner_id: agentId, deal_id: result.deal.id, requirement_type: type },
                },
            });
        }

        logger.info(`[AgentDeals] Partner ${agentId} created deal ${result.deal.id}${pendingPartnerClaim ? ' (PENDING approval — direct-client claim)' : ''}`);
        res.status(201).json({
            deal: result.deal,
            matches: pendingPartnerClaim ? [] : result.matches,
            pending_approval: pendingPartnerClaim,
            message: pendingPartnerClaim
                ? 'Submitted. This client is already with RealtyPandit — your lead is pending team approval.'
                : result.matches.length > 0
                    ? `Deal created! ${result.matches.length} matching properties found.`
                    : 'Deal created! Your coordinator will be in touch.',
        });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'agent#20' });
        logger.error('[AgentDeals] Create deal error:', error);
        res.status(500).json({ error: 'Failed to create deal' });
    }
});

// GET /agent/deals — Partner's deals (masked view)
router.get('/deals', authenticateAgent, async (req: any, res) => {
    try {
        const agentId = req.agentId;
        const { status, page, limit } = req.query;

        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return res.status(500).json({ error: 'System not configured' });

        // Find deals where this partner is demand or supply handler
        const where: any = {
            tenant_id: tenant.id,
            OR: [
                { demand_handler_id: agentId },
                { supply_handler_id: agentId },
            ],
        };
        if (status) where.status = status;

        const skip = ((parseInt(page) || 1) - 1) * (parseInt(limit) || 20);
        const take = parseInt(limit) || 20;

        const [deals, total] = await Promise.all([
            prisma.transaction.findMany({
                where,
                skip,
                take,
                orderBy: { updated_at: 'desc' },
                include: {
                    demand_contact: { select: { name: true, contact_type: true } },
                    coordinator: { select: { id: true, name: true, phone: true } },
                    inventory: { select: { id: true, type: true, location: true, price: true, media_urls: true } },
                },
            }),
            prisma.transaction.count({ where }),
        ]);

        // Mask data: partners see customer first name only, never see other partner details
        const maskedDeals = deals.map(d => ({
            id: d.id,
            type: d.type,
            status: d.status,
            deal_scenario: d.deal_scenario,
            customer_name: d.demand_handler_id === agentId
                ? d.demand_contact?.name // Own customer - full name
                : maskName(d.demand_contact?.name || ''), // Other's customer - masked
            coordinator: d.coordinator ? { name: d.coordinator.name, phone: d.coordinator.phone } : null,
            property: d.inventory ? {
                type: d.inventory.type,
                location: d.inventory.location,
                price: d.inventory.price,
                image: (d.inventory.media_urls as string[])?.[0] || null,
            } : null,
            demand_location: d.demand_location,
            demand_budget_min: d.demand_budget_min,
            demand_budget_max: d.demand_budget_max,
            created_at: d.created_at,
            updated_at: d.updated_at,
        }));

        res.json({
            deals: maskedDeals,
            pagination: { page: parseInt(page) || 1, limit: take, total, totalPages: Math.ceil(total / take) },
        });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'agent#21' });
        logger.error('[AgentDeals] List deals error:', error);
        res.status(500).json({ error: 'Failed to fetch deals' });
    }
});

// GET /agent/deals/:id — Single deal detail (masked)
router.get('/deals/:id', authenticateAgent, async (req: any, res) => {
    try {
        const agentId = req.agentId;
        const deal = await getDealById(req.params.id);
        if (!deal) return res.status(404).json({ error: 'Deal not found' });

        // Verify this partner is involved in the deal
        if (deal.demand_handler_id !== agentId && deal.supply_handler_id !== agentId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const isDemandHandler = deal.demand_handler_id === agentId;

        res.json({
            id: deal.id,
            type: deal.type,
            status: deal.status,
            deal_scenario: deal.deal_scenario,
            customer_name: isDemandHandler
                ? deal.demand_contact?.name
                : maskName(deal.demand_contact?.name || ''),
            customer_phone: isDemandHandler
                ? deal.demand_contact?.phone_number
                : null, // Supply partners never see customer phone
            coordinator: deal.coordinator ? { name: deal.coordinator.name, phone: deal.coordinator.phone } : null,
            property: deal.inventory ? {
                id: deal.inventory.id,
                type: deal.inventory.type,
                location: deal.inventory.location,
                price: deal.inventory.price,
                media_urls: deal.inventory.media_urls,
            } : null,
            demand_location: deal.demand_location,
            demand_budget_min: deal.demand_budget_min,
            demand_budget_max: deal.demand_budget_max,
            // Phase 5 (demand canonicalization): legacy demand_property_type was dropped.
            // Surface the canonical taxonomy node + schema values instead.
            demand_taxonomy_node_id: (deal as any).demand_taxonomy_node_id ?? null,
            demand_schema_values: (deal as any).demand_schema_values ?? null,
            logs: deal.logs?.map(l => ({
                action: l.action,
                details: l.details,
                created_at: l.created_at,
            })),
            queries: deal.queries,
            created_at: deal.created_at,
            updated_at: deal.updated_at,
        });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'agent#22' });
        logger.error('[AgentDeals] Get deal error:', error);
        res.status(500).json({ error: 'Failed to fetch deal' });
    }
});

// GET /agent/deals/:id/matches — Browse matched properties for a deal (one at a time)
router.get('/deals/:id/matches', authenticateAgent, async (req: any, res) => {
    try {
        const agentId = req.agentId;
        const deal = await prisma.transaction.findUnique({ where: { id: req.params.id } });
        if (!deal) return res.status(404).json({ error: 'Deal not found' });

        if (deal.demand_handler_id !== agentId && deal.supply_handler_id !== agentId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { MatchingEngine: ME } = await import('../services/matching_engine');
        const engine = new ME();

        const matches = await engine.findMatches({
            intent: deal.demand_intent === 'rent_lease' ? 'rent' : 'buy',
            // Canonical-first (Phase 5): legacy demand_type_slug / demand_property_type
            // columns dropped. MatchingEngine handles taxonomy_node + schema_values now.
            demand_taxonomy_node_id: (deal as any).demand_taxonomy_node_id ?? null,
            demand_schema_values: (deal as any).demand_schema_values ?? null,
            budget_min: deal.demand_budget_min ? Number(deal.demand_budget_min) : undefined,
            budget_max: deal.demand_budget_max ? Number(deal.demand_budget_max) : undefined,
            preferred_location: deal.demand_location || undefined,
        }, 20);

        // Route through SanitizationService — owner/source/exact-address are stripped for
        // partner viewers (single source of truth for cross-team/partner visibility rules).
        const viewer = viewerFromPartner(agentId);
        const sanitized = applyRoleMaskList(matches as any[], viewer);

        res.json({ deal_id: deal.id, matches: sanitized, total: sanitized.length });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'agent#23' });
        logger.error('[AgentDeals] Get matches error:', error);
        res.status(500).json({ error: 'Failed to fetch matches' });
    }
});

// POST /agent/deals/:id/schedule-visit — Schedule visit for a matched property
router.post('/deals/:id/schedule-visit', authenticateAgent, async (req: any, res) => {
    try {
        const agentId = req.agentId;
        const deal = await prisma.transaction.findUnique({ where: { id: req.params.id } });
        if (!deal) return res.status(404).json({ error: 'Deal not found' });

        if (deal.demand_handler_id !== agentId && deal.supply_handler_id !== agentId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { property_id, preferred_date, preferred_time, notes } = req.body;
        if (!property_id) return res.status(400).json({ error: 'property_id is required' });

        const agent = await prisma.partnerAgent.findUnique({ where: { id: agentId } });
        const customerContact = deal.demand_contact_id;

        const visit = await prisma.scheduledVisit.create({
            data: {
                contact_id: customerContact,
                property_id,
                agent_id: agentId,
                name: agent?.name || 'Partner Customer',
                phone: customerContact,
                preferred_date: preferred_date ? new Date(preferred_date) : new Date(),
                preferred_time: preferred_time || 'To be confirmed',
                message: notes || null,
                source: 'partner_portal',
                status: 'scheduled',
            },
        });

        logger.info(`[AgentDeals] Partner ${agentId} scheduled visit ${visit.id} for deal ${req.params.id}`);
        res.status(201).json({ visit_id: visit.id, message: 'Visit scheduled! Your coordinator will confirm.' });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'agent#24' });
        logger.error('[AgentDeals] Schedule visit error:', error);
        res.status(500).json({ error: 'Failed to schedule visit' });
    }
});

// POST /agent/deals/:id/query — Partner raises a query
router.post('/deals/:id/query', authenticateAgent, validate(createDealQuerySchema), async (req: any, res) => {
    try {
        const agentId = req.agentId;
        const deal = await prisma.transaction.findUnique({ where: { id: req.params.id } });
        if (!deal) return res.status(404).json({ error: 'Deal not found' });

        // Verify partner is involved
        if (deal.demand_handler_id !== agentId && deal.supply_handler_id !== agentId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const raisedByType = deal.demand_handler_id === agentId ? 'partner_demand' : 'partner_supply';

        const query = await prisma.dealQuery.create({
            data: {
                transaction_id: req.params.id,
                raised_by_type: raisedByType,
                raised_by_id: agentId,
                subject: req.body.subject,
                message: req.body.message,
                status: 'OPEN',
            },
        });

        logger.info(`[AgentDeals] Partner ${agentId} raised query ${query.id} on deal ${req.params.id}`);
        res.status(201).json(query);
    } catch (error: any) {
        captureRouteError(error, req, { route: 'agent#25' });
        logger.error('[AgentDeals] Create query error:', error);
        res.status(500).json({ error: 'Failed to create query' });
    }
});

export default router;
