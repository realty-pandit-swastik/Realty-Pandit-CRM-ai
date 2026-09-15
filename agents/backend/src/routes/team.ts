
import { Router } from 'express';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import bcrypt from 'bcryptjs';
import prisma from '../db';
import logger from '../utils/logger';
import { authMiddleware, checkPermission } from '../middleware/auth';
import { requireSuperBoss } from '../middleware/require_super_boss';
import { emailProvisioner } from '../services/email_provisioner';
import { ensureOwner } from '../services/ensure_owner';
import { WhatsAppService } from '../services/whatsapp';
import { notify } from '../services/notify';
import { ownershipService } from '../services/ownership_service';
import { invalidateSubtreeCache } from '../services/analytics_scope';
import { captureRouteError } from '../utils/capture';
import { getTargetsForManager, upsertTargets } from '../services/targets';

const whatsappService = new WhatsAppService();
const ADMIN_PANEL_URL = process.env.ADMIN_PANEL_URL || 'https://admin.realtypandit.in';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// GET /api/team/inventory/bulk-template - Download CSV template (no auth, static data)
router.get('/inventory/bulk-template', (req, res) => {
    const template = [
        'type,category,intent,state,district,locality,pincode,price,price_unit,bedrooms,bathrooms,area,area_unit,owner_phone,owner_name,status,furnishing,floor_number,total_floors,facing,property_age,key_holder_type,amenities,category_slug,sub_category_slug,type_slug,configuration_slug',
        'flat,residential,sell,Uttar Pradesh,Gautam Buddh Nagar,"Sector 18, Noida",201301,5500000,Lakh,2,2,1200,sqft,9999999999,Rahul Sharma,active,semi_furnished,3,12,north,1-3_years,UPLOADER,"parking,lift,security",residential,apartment,flat,2_bhk',
        'house,residential,rent,Haryana,Gurgaon,"DLF Phase 2",122002,45000,,3,3,2500,sqft,9888888888,Priya Singh,active,fully_furnished,,,east,,OWNER,"parking,garden,security",residential,individual_housing,independent_house,',
        'plot,commercial,sell,Uttar Pradesh,Gautam Buddh Nagar,"Noida Extension",201306,8000000,Lakh,,,2000,sqyd,9777777777,Amit Kumar,active,,,,,new_construction,EXTERNAL,"",commercial,,,',
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory_template.csv"');
    res.send(template);
});

// NOTE: the public Google OAuth callback (GET /api/team/google/callback) is
// registered at the APP level in app.ts (before the `/api` JWT auth), NOT
// here — the same hoisting the inventory bulk-template route needs. See the
// "Public team endpoints" block in app.ts.

// All team routes below require authentication
router.use(authMiddleware);

// =============================================================
// SELF-SERVICE
// =============================================================

/**
 * GET /api/team/me — current logged-in agent's profile.
 * Used by the team profile UI to seed the editable Portal Account Email field.
 */
router.get('/me', async (req: any, res) => {
    try {
        const agentId = req.agent?.id;
        if (!agentId) return res.status(401).json({ success: false, error: 'Unauthenticated' });
        const me = await prisma.agent.findUnique({
            where: { id: agentId },
            select: {
                id: true, name: true, role: true, email: true, phone: true,
                personal_email: true, status: true, department: true,
                email_mailbox_activated: true,
            },
        });
        return res.json({ success: true, data: me });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'team#1' });
        logger.error('[TeamAPI] /me error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PATCH /api/team/me/portal-email — agent self-updates personal_email.
 * This email keys 99acres SubUserName / Housing broker_email matching, so incoming
 * external leads are routed to the team member who owns the listing on that portal.
 * Empty string clears it.
 */
router.patch('/me/portal-email', async (req: any, res) => {
    try {
        const agentId = req.agent?.id;
        if (!agentId) return res.status(401).json({ success: false, error: 'Unauthenticated' });
        const { portal_email } = req.body || {};
        if (typeof portal_email !== 'string') {
            return res.status(400).json({ success: false, error: 'portal_email must be a string' });
        }
        const trimmed = portal_email.trim();
        const value = trimmed === '' ? null : trimmed;
        if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            return res.status(400).json({ success: false, error: 'Invalid email format' });
        }
        await prisma.agent.update({
            where: { id: agentId },
            data: { personal_email: value },
        });
        return res.json({ success: true, personal_email: value });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'team#2' });
        logger.error('[TeamAPI] portal-email update error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PATCH /api/team/me/profile — agent self-updates their OWN name only
 * (2026-05-19). Auth-only, NO admin permission (mirrors the other /me
 * self-service routes). **Phone is intentionally NOT self-editable**: it is
 * the account identity (phone login + WhatsApp OTP reset + Panditji
 * recognition). Any `phone` in the body is ignored; only an admin can change
 * it via PATCH /members/:id. role/department/manager/personal_email also stay
 * admin-managed / their own endpoints. See
 * docs/plans/2026-05-18-member-self-profile.md
 */
router.patch('/me/profile', async (req: any, res) => {
    try {
        const agentId = req.agent?.id;
        if (!agentId) return res.status(401).json({ success: false, error: 'Unauthenticated' });
        const { name } = req.body || {};
        // Note: `phone` (and any other field) is deliberately not read here.

        const data: any = {};
        if (name !== undefined) {
            const n = String(name).trim();
            if (n.length < 2) return res.status(400).json({ success: false, error: 'Name must be at least 2 characters' });
            data.name = n;
        }
        if (Object.keys(data).length === 0) {
            return res.status(400).json({ success: false, error: 'Nothing to update' });
        }

        const updated = await prisma.agent.update({
            where: { id: agentId },
            data,
            select: {
                id: true, name: true, email: true, phone: true,
                role: true, department: true, status: true, personal_email: true,
            },
        });

        logger.info(`[TeamAPI] Self profile updated by agent ${agentId} (${Object.keys(data).join(', ')})`);
        return res.json({ success: true, data: updated });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'team#me-profile' });
        logger.error('[TeamAPI] self profile update error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/team/me/mailbox-password — member sets/activates their OWN
 * @realtypandit.in mailbox password (self-hosted Dovecot), 2026-05-19.
 * Auth-only. On success flips `email_mailbox_activated=true` so the profile
 * then reveals the Outlook IMAP/SMTP setup details.
 *
 * SECURITY: the password is interpolated into a shell `sed` command inside
 * emailProvisioner.updatePassword, so it is strictly allow-listed here to
 * exclude every shell- and sed-special character (| \ / & " ' $ ` space …).
 */
router.post('/me/mailbox-password', async (req: any, res) => {
    try {
        const agentId = req.agent?.id;
        if (!agentId) return res.status(401).json({ success: false, error: 'Unauthenticated' });

        const newPassword = String((req.body || {}).newPassword ?? '');
        // Allow-list only: letters, digits, and a safe symbol set. Anything
        // outside this (incl. | \ / & " ' $ ` and whitespace) is rejected.
        if (!/^[A-Za-z0-9!@#%^*()_\-+=.:?]{8,64}$/.test(newPassword)) {
            return res.status(400).json({
                success: false,
                error: 'Password must be 8–64 chars, using letters, digits, and ! @ # % ^ * ( ) _ - + = . : ? only',
            });
        }

        const me = await prisma.agent.findUnique({
            where: { id: agentId },
            select: { email: true },
        });
        // The mail server keys every mailbox by the lowercase address (that's
        // how the provisioner generates them); agent.email can be mixed-case,
        // so normalize before touching Postfix/Dovecot.
        const mailbox = String(me?.email || '').trim().toLowerCase();
        // Defense in depth: only operate on a well-formed in-house mailbox.
        if (!/^[a-z0-9._-]+@realtypandit\.in$/.test(mailbox)) {
            return res.status(400).json({ success: false, error: 'Your account has no Realty Pandit mailbox' });
        }

        // provision() is idempotent: it creates the Maildir + Postfix vmailbox
        // + Dovecot entry if missing, or just updates the password if present.
        // (updatePassword() alone would silently no-op for a member whose
        // mailbox was never provisioned → false "activated".)
        await emailProvisioner.provision(mailbox, newPassword);
        await prisma.agent.update({
            where: { id: agentId },
            data: { email_mailbox_activated: true },
        });

        logger.info(`[TeamAPI] Mailbox provisioned + activated for agent ${agentId} (${mailbox})`);
        return res.json({ success: true, data: { mailbox } });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'team#me-mailbox-password' });
        logger.error('[TeamAPI] set mailbox password error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/team/me/email-config — current agent's outbound email config (T9b).
 * Never returns the stored password — only whether one is set.
 */
router.get('/me/email-config', async (req: any, res) => {
    try {
        const agentId = req.agent?.id;
        if (!agentId) return res.status(401).json({ success: false, error: 'Unauthenticated' });
        const a = await prisma.agent.findUnique({
            where: { id: agentId },
            select: {
                email: true,
                email_provider: true, email_smtp_host: true, email_smtp_port: true,
                email_smtp_secure: true, email_smtp_username: true,
                email_smtp_password: true, email_configured_at: true,
            },
        });
        if (!a) return res.status(404).json({ success: false, error: 'Agent not found' });
        return res.json({
            success: true,
            data: {
                account_email: a.email,
                provider: a.email_provider,
                smtp_host: a.email_smtp_host,
                smtp_port: a.email_smtp_port,
                smtp_secure: a.email_smtp_secure,
                smtp_username: a.email_smtp_username,
                password_set: !!a.email_smtp_password,
                configured_at: a.email_configured_at,
            },
        });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'team#email-config-get' });
        logger.error('[TeamAPI] email-config get error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PUT /api/team/me/email-config — agent self-configures their sending mailbox
 * (Outlook/Office365/Gmail/custom). Password is AES-256-GCM encrypted at rest.
 * Send `password: ''` (omit) to keep the existing password; `clear: true` wipes config.
 */
router.put('/me/email-config', async (req: any, res) => {
    try {
        const agentId = req.agent?.id;
        if (!agentId) return res.status(401).json({ success: false, error: 'Unauthenticated' });
        const { provider, smtp_host, smtp_port, smtp_secure, smtp_username, password, clear } = req.body || {};

        if (clear === true) {
            await prisma.agent.update({
                where: { id: agentId },
                data: {
                    email_provider: null, email_smtp_host: null, email_smtp_port: null,
                    email_smtp_secure: null, email_smtp_username: null,
                    email_smtp_password: null, email_configured_at: null,
                },
            });
            return res.json({ success: true, cleared: true });
        }

        if (!smtp_host || !smtp_port || !smtp_username) {
            return res.status(400).json({ success: false, error: 'smtp_host, smtp_port and smtp_username are required' });
        }
        const port = parseInt(String(smtp_port), 10);
        if (isNaN(port) || port < 1 || port > 65535) {
            return res.status(400).json({ success: false, error: 'smtp_port must be a valid port number' });
        }

        const data: any = {
            email_provider: provider || 'custom',
            email_smtp_host: String(smtp_host).trim(),
            email_smtp_port: port,
            email_smtp_secure: smtp_secure === true || port === 465,
            email_smtp_username: String(smtp_username).trim(),
            email_configured_at: new Date(),
        };

        if (password && String(password).length > 0) {
            const { encryptSecret } = await import('../utils/crypto');
            data.email_smtp_password = encryptSecret(String(password));
        } else {
            // Keep existing password; reject if none stored yet.
            const existing = await prisma.agent.findUnique({
                where: { id: agentId }, select: { email_smtp_password: true },
            });
            if (!existing?.email_smtp_password) {
                return res.status(400).json({ success: false, error: 'password is required for first-time setup' });
            }
        }

        await prisma.agent.update({ where: { id: agentId }, data });
        logger.info(`[TeamAPI] Email config saved for agent ${agentId} (${data.email_provider})`);
        return res.json({ success: true });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'team#email-config-put' });
        logger.error('[TeamAPI] email-config put error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// =============================================================
// GOOGLE ACCOUNT LINK (2026-05-18) — self-service, mirrors email-config
// =============================================================

/**
 * GET /api/team/me/google/connect — returns the Google consent URL.
 * Frontend opens it (we return JSON, not a 302, because this route is behind
 * Bearer/cookie auth and a redirect would lose the auth context).
 */
router.get('/me/google/connect', async (req: any, res) => {
    try {
        const agentId = req.agent?.id;
        if (!agentId) return res.status(401).json({ success: false, error: 'Unauthenticated' });

        const { isGoogleOAuthConfigured, signState, buildConnectUrl } = await import('../services/google_oauth');
        if (!isGoogleOAuthConfigured()) {
            return res.status(503).json({ success: false, error: 'Google integration is not configured' });
        }

        const url = buildConnectUrl(signState(agentId));
        return res.json({ success: true, data: { url } });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'team#google-connect' });
        logger.error('[TeamAPI] google connect error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/team/me/google-config — connection status (never the token).
 */
router.get('/me/google-config', async (req: any, res) => {
    try {
        const agentId = req.agent?.id;
        if (!agentId) return res.status(401).json({ success: false, error: 'Unauthenticated' });

        const a = await prisma.agent.findUnique({
            where: { id: agentId },
            select: {
                google_email: true,
                google_refresh_token: true,
                google_connected_at: true,
                google_sync_enabled: true,
            },
        });
        if (!a) return res.status(404).json({ success: false, error: 'Agent not found' });

        const { isGoogleOAuthConfigured } = await import('../services/google_oauth');
        return res.json({
            success: true,
            data: {
                available: isGoogleOAuthConfigured(),
                connected: !!a.google_refresh_token,
                google_email: a.google_email,
                connected_at: a.google_connected_at,
                sync_enabled: a.google_sync_enabled,
            },
        });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'team#google-config-get' });
        logger.error('[TeamAPI] google-config get error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PUT /api/team/me/google-config — toggle sync on/off (opt-out without
 * disconnecting). Body: { sync_enabled: boolean }.
 */
router.put('/me/google-config', async (req: any, res) => {
    try {
        const agentId = req.agent?.id;
        if (!agentId) return res.status(401).json({ success: false, error: 'Unauthenticated' });

        const { sync_enabled } = req.body || {};
        if (typeof sync_enabled !== 'boolean') {
            return res.status(400).json({ success: false, error: 'sync_enabled (boolean) is required' });
        }

        await prisma.agent.update({
            where: { id: agentId },
            data: { google_sync_enabled: sync_enabled },
        });
        logger.info(`[TeamAPI] Google sync ${sync_enabled ? 'enabled' : 'disabled'} for agent ${agentId}`);
        return res.json({ success: true });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'team#google-config-put' });
        logger.error('[TeamAPI] google-config put error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * DELETE /api/team/me/google — disconnect: best-effort revoke at Google, then
 * wipe the local columns regardless.
 */
router.delete('/me/google', async (req: any, res) => {
    try {
        const agentId = req.agent?.id;
        if (!agentId) return res.status(401).json({ success: false, error: 'Unauthenticated' });

        const a = await prisma.agent.findUnique({
            where: { id: agentId },
            select: { google_refresh_token: true },
        });

        if (a?.google_refresh_token) {
            const { revokeRefreshToken } = await import('../services/google_oauth');
            await revokeRefreshToken(a.google_refresh_token);
        }

        await prisma.agent.update({
            where: { id: agentId },
            data: {
                google_refresh_token: null,
                google_email: null,
                google_connected_at: null,
                google_sync_enabled: true,
            },
        });
        logger.info(`[TeamAPI] Google disconnected for agent ${agentId}`);
        return res.json({ success: true });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'team#google-disconnect' });
        logger.error('[TeamAPI] google disconnect error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// =============================================================
// TEAM MEMBER MANAGEMENT
// =============================================================

// GET /api/team/members-list - Lightweight list of team member names (for dropdowns, accessible to all)
router.get('/members-list', checkPermission('view_inventory'), async (req, res) => {
    try {
        const members = await prisma.agent.findMany({
            where: { tenant_id: req.agent!.tenant_id, status: 'active' },
            select: { id: true, name: true, role: true },
            orderBy: [{ role: 'asc' }, { name: 'asc' }]
        });
        res.json(members);
    } catch (error) {
        captureRouteError(error, req, { route: 'team#3' });
        logger.error('Team members-list fetch error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/team/members - List all team members
// GET /api/team/targets - the requesting manager's monthly team targets (or defaults). Phase 5B.
router.get('/targets', checkPermission('manage_team'), async (req, res) => {
    try {
        const tenantId = req.agent?.tenant_id;
        if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
        const managerId = (req.query.manager_id as string) || req.agent!.id;
        const targets = await getTargetsForManager(tenantId, managerId);
        res.json({ manager_agent_id: managerId, targets });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'team#get-targets' });
        res.status(500).json({ error: 'Failed to fetch targets' });
    }
});

// PUT /api/team/targets - upsert the requesting manager's monthly team targets. Phase 5B.
router.put('/targets', checkPermission('manage_team'), async (req, res) => {
    try {
        const tenantId = req.agent?.tenant_id;
        if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
        const managerId = (req.body.manager_id as string) || req.agent!.id;
        const num = (v: any, d: number) => { const n = Number(v); return isFinite(n) && n >= 0 ? n : d; };
        const targets = {
            leads: num(req.body.leads, 30),
            appointments: num(req.body.appointments, 15),
            inventory: num(req.body.inventory, 10),
            conversionRate: num(req.body.conversion_rate ?? req.body.conversionRate, 0.2),
        };
        await upsertTargets(tenantId, managerId, targets);
        res.json({ ok: true, manager_agent_id: managerId, targets });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'team#put-targets' });
        res.status(500).json({ error: 'Failed to save targets' });
    }
});

router.get('/members', checkPermission('manage_team'), async (req, res) => {
    try {
        const members = await prisma.agent.findMany({
            where: { tenant_id: req.agent!.tenant_id },
            select: {
                id: true, name: true, email: true, phone: true,
                role: true, department: true, status: true,
                last_login_at: true, created_at: true,
                reports_to: { select: { name: true, email: true } },
                _count: { select: { assigned_leads: true } }
            },
            orderBy: [{ role: 'asc' }, { name: 'asc' }]
        });

        // #5 (2026-07-25): per-agent LAST ACTIVITY (timestamp + what) merged across pipeline
        // actions (TeamAction), listing add/edit (inventory.uploaded_by) and task work (Task).
        // DISTINCT ON gives the single latest row per agent from each source; we pick the newest.
        const [taRows, invRows, taskRows] = await Promise.all([
            prisma.$queryRawUnsafe<any[]>(`SELECT DISTINCT ON (agent_id) agent_id, created_at AS at, action_type AS typ FROM team_actions ORDER BY agent_id, created_at DESC`),
            prisma.$queryRawUnsafe<any[]>(`SELECT DISTINCT ON (uploaded_by_agent_id) uploaded_by_agent_id AS agent_id, updated_at AS at FROM inventory WHERE uploaded_by_agent_id IS NOT NULL ORDER BY uploaded_by_agent_id, updated_at DESC`),
            prisma.$queryRawUnsafe<any[]>(`SELECT DISTINCT ON (assigned_to) assigned_to AS agent_id, GREATEST(created_at, COALESCE(completed_at, created_at)) AS at FROM tasks ORDER BY assigned_to, GREATEST(created_at, COALESCE(completed_at, created_at)) DESC`),
        ]);
        const ACTION_LABEL: Record<string, string> = {
            CALLED: 'Called', WHATSAPPED: 'WhatsApped', SCHEDULED_VISIT: 'Scheduled visit',
            CONFIRMED_VISIT: 'Confirmed visit', VISIT_RESCHEDULED: 'Rescheduled visit',
            REMINDER_GIVEN: 'Gave reminder', LOGGED_NOTE: 'Logged note', MEETING_BOOKED: 'Meeting update',
            PAUSED_AI: 'Paused AI', RESUMED_AI: 'Resumed AI',
        };
        const label = (t: string) => ACTION_LABEL[t] || (t ? t.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : 'Activity');
        const acc: Record<string, { at: Date; type: string }> = {};
        const consider = (agentId: string, at: any, type: string) => {
            if (!agentId || !at) return;
            const d = new Date(at);
            if (!acc[agentId] || d > acc[agentId].at) acc[agentId] = { at: d, type };
        };
        for (const r of taRows) consider(r.agent_id, r.at, label(r.typ));
        for (const r of invRows) consider(r.agent_id, r.at, 'Updated a listing');
        for (const r of taskRows) consider(r.agent_id, r.at, 'Task activity');
        const enriched = members.map(m => ({
            ...m,
            last_activity_at: acc[m.id]?.at ?? null,
            last_activity_type: acc[m.id]?.type ?? null,
        }));
        res.json(enriched);
    } catch (error) {
        captureRouteError(error, req, { route: 'team#4' });
        logger.error('Team members fetch error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/team/email-preview - Preview auto-generated email for a name
router.get('/email-preview', checkPermission('manage_team'), async (req, res) => {
    const { name } = req.query;
    if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'name query param required' });
    }
    try {
        const email = await emailProvisioner.generateUniqueEmail(name);
        res.json({ email });
    } catch (error) {
        captureRouteError(error, req, { route: 'team#5' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /api/team/members - Create a new team member
router.post('/members', checkPermission('create_agents'), async (req, res) => {
    const { name, phone, role, department, reports_to_id, customEmail, customPassword, personal_email } = req.body;

    if (!name || !phone) {
        return res.status(400).json({ error: 'name and phone are required' });
    }

    // Normalize phone to E.164
    const normalizedPhone = phone.startsWith('+') ? phone : `+91${phone.replace(/^0+/, '')}`;

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
        // Auto-generate or use custom email
        const email = customEmail || await emailProvisioner.generateUniqueEmail(name);

        // Check email uniqueness
        const existing = await prisma.agent.findUnique({ where: { email } });
        if (existing) {
            return res.status(400).json({ error: `Email ${email} is already in use` });
        }

        // Generate temporary password if not provided
        const tempPassword = customPassword || generateTempPassword();
        const passwordHash = await bcrypt.hash(tempPassword, 10);

        // Create agent record
        const agent = await prisma.agent.create({
            data: {
                name,
                email,
                phone: normalizedPhone,
                role: targetRole,
                department: department || null,
                password_hash: passwordHash,
                tenant_id: req.agent!.tenant_id,
                reports_to_id: reports_to_id || null,
                personal_email: personal_email ? personal_email.trim().toLowerCase() : null,
                status: 'active'
            },
            select: {
                id: true, name: true, email: true, phone: true,
                role: true, department: true, status: true, created_at: true
            }
        });

        // Hierarchy changed -> drop the analytics visibility-subtree cache for this tenant.
        invalidateSubtreeCache(req.agent!.tenant_id);

        // SSOT: Upsert Contact record for this team member
        const tenant = await prisma.tenant.findUnique({ where: { id: req.agent!.tenant_id } });
        if (tenant) {
            await prisma.contact.upsert({
                where: { phone_number: normalizedPhone },
                create: {
                    phone_number: normalizedPhone,
                    tenant_id: req.agent!.tenant_id,
                    name,
                    email,
                    contact_type: 'MANAGEMENT',
                    source: 'admin_created',
                    created_by: req.agent?.id || null,
                },
                update: {
                    name,
                    email,
                    contact_type: 'MANAGEMENT'
                }
            });

            // Log interaction
            await prisma.interaction.create({
                data: {
                    tenant_id: req.agent!.tenant_id,
                    phone_number: normalizedPhone,
                    channel: 'admin',
                    direction: 'outbound',
                    event_type: 'team_member_created',
                    content: `Team member created: ${name} (${targetRole}${department ? ', ' + department : ''})`,
                    metadata: { agent_id: agent.id, created_by: req.agent!.id, role: targetRole, department }
                }
            });
        }

        // Provision email mailbox (non-blocking)
        emailProvisioner.provision(email, tempPassword).catch(err => {
            logger.warn(`[Team] Email provision failed for ${email}: ${err.message}`);
        });

        // Generate setup token for password self-service
        const setupToken = randomUUID();
        const setupExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours
        await prisma.agent.update({
            where: { id: agent.id },
            data: { setup_token: setupToken, setup_token_expires: setupExpiry },
        });

        const setupLink = `${ADMIN_PANEL_URL}/setup-password?token=${setupToken}`;

        // Send WhatsApp welcome message (non-blocking)
        sendWelcomeWhatsApp(normalizedPhone, name, targetRole, department, email, setupLink, req.agent!.tenant_id, req.agent!.name)
            .catch(err => logger.warn(`[Team] WhatsApp welcome failed for ${normalizedPhone}: ${err.message}`));

        // Notify all admins about new team member
        const admins = await prisma.agent.findMany({ where: { role: { in: ['super_boss', 'manager'] }, status: 'active', id: { not: req.agent!.id } }, select: { id: true, phone: true, email: true, name: true } });
        if (admins.length > 0) {
            notify('team_member_joined', admins.map(a => ({ id: a.id, type: 'agent' as const, phone: a.phone, email: a.email || undefined, name: a.name })), {
                name, role: targetRole,
            });
        }

        res.status(201).json({
            agent,
            setupLink,
            credentials: {
                email,
                tempPassword,
                setupLink,
                imapHost: 'mail.realtypandit.in',
                imapPort: 993,
                smtpHost: 'mail.realtypandit.in',
                smtpPort: 587,
                note: 'A welcome message with password setup link has been sent to their WhatsApp.'
            }
        });
    } catch (error) {
        captureRouteError(error, req, { route: 'team#6' });
        logger.error('Create team member error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/team/members/:id - Get individual member profile
router.get('/members/:id', checkPermission('manage_team'), async (req, res) => {
    try {
        const member = await prisma.agent.findFirst({
            where: { id: req.params.id, tenant_id: req.agent!.tenant_id },
            select: {
                id: true, name: true, email: true, phone: true,
                role: true, department: true, status: true,
                last_login_at: true, created_at: true, personal_email: true,
                nine9acres_email: true, magicbricks_email: true,
                reports_to: { select: { id: true, name: true, role: true } },
                subordinates: { select: { id: true, name: true, role: true, department: true, status: true } },
                _count: { select: { assigned_leads: true } },
            },
        });
        if (!member) return res.status(404).json({ error: 'Member not found' });
        res.json(member);
    } catch (error) {
        captureRouteError(error, req, { route: 'team#7' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// PATCH /api/team/members/:id - Update member details
router.patch('/members/:id', checkPermission('manage_team'), async (req, res) => {
    const { id } = req.params;
    const { name, phone, department, role, personal_email, reports_to_id, nine9acres_email, magicbricks_email } = req.body;

    // Role changes: only super_boss
    if (role && req.agent!.role !== 'super_boss') {
        return res.status(403).json({ error: 'Only super_boss can change roles' });
    }
    // Manager assignment: only super_boss
    if (reports_to_id !== undefined && req.agent!.role !== 'super_boss') {
        return res.status(403).json({ error: 'Only super_boss can change manager assignment' });
    }

    try {
        const updateData: any = {};
        if (name) updateData.name = name;
        if (phone) updateData.phone = phone.startsWith('+') ? phone : `+91${phone.replace(/^0+/, '')}`;
        if (department !== undefined) updateData.department = department;
        if (role) updateData.role = role;
        if (personal_email !== undefined) {
            updateData.personal_email = personal_email ? personal_email.trim().toLowerCase() : null;
        }
        // Portal lead-routing identifiers (2026-06-25) — manager/super_boss enter the email/ID the
        // member uses on each portal so their listing leads route to them instead of round-robin.
        if (nine9acres_email !== undefined) {
            updateData.nine9acres_email = nine9acres_email ? String(nine9acres_email).trim().toLowerCase() : null;
        }
        if (magicbricks_email !== undefined) {
            updateData.magicbricks_email = magicbricks_email ? String(magicbricks_email).trim().toLowerCase() : null;
        }
        if (reports_to_id !== undefined) updateData.reports_to_id = reports_to_id || null;

        const agent = await prisma.agent.update({
            where: { id },
            data: updateData,
            select: {
                id: true, name: true, email: true, phone: true,
                role: true, department: true, status: true
            }
        });

        // Manager reassignment (or role change) alters the visibility subtree.
        if (updateData.reports_to_id !== undefined || updateData.role !== undefined) {
            invalidateSubtreeCache(req.agent!.tenant_id);
        }

        // SSOT: Sync Contact record when phone is updated
        if (updateData.phone) {
            await prisma.contact.upsert({
                where: { phone_number: updateData.phone },
                create: {
                    phone_number: updateData.phone,
                    tenant_id: req.agent!.tenant_id,
                    name: agent.name,
                    email: agent.email,
                    contact_type: 'MANAGEMENT',
                    source: 'team_update',
                    created_by: req.agent?.id || null,
                },
                update: {
                    contact_type: 'MANAGEMENT',
                    name: agent.name,
                    email: agent.email,
                }
            });
        }

        res.json(agent);
    } catch (error) {
        captureRouteError(error, req, { route: 'team#8' });
        logger.error('Update team member error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /api/team/members/:id/transfer-assets — 2026-05-12 two-step deactivation flow.
// Admin selects a target agent and (optionally) specific asset buckets. Use this to
// drain a leaving team member's pipeline before flipping them to inactive.
router.post('/members/:id/transfer-assets', checkPermission('manage_settings'), async (req, res) => {
    const fromAgentId = String(req.params.id);
    const { to_agent_id, asset_types, reason } = req.body as {
        to_agent_id?: string;
        asset_types?: { partners?: boolean; inventory?: boolean; contacts?: boolean; leads?: boolean; transactions?: boolean };
        reason?: string;
    };

    if (!to_agent_id) return res.status(400).json({ error: 'to_agent_id is required' });
    if (fromAgentId === req.agent!.id) return res.status(400).json({ error: 'Cannot transfer assets from yourself via this endpoint' });

    try {
        const result = await ownershipService.transferAssets(
            fromAgentId,
            to_agent_id,
            req.agent!.id,
            asset_types,
        );
        logger.warn(
            `[Team] Asset transfer ${fromAgentId} -> ${to_agent_id} by ${req.agent!.id} ` +
            `(reason="${reason ?? ''}"; partners=${result.counts.partners} ` +
            `inv=${result.counts.inventory} contacts=${result.counts.contacts} ` +
            `leads=${result.counts.leads} txn=${result.counts.transactions})`,
        );
        res.json({ success: true, ...result });
    } catch (error) {
        captureRouteError(error, req, { route: 'team#transfer-assets' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// PATCH /api/team/members/:id/deactivate - Deactivate or reactivate a member
//
// 2026-05-12 (two-step deactivation): if the agent still owns ANY assets when status='inactive',
// the route REJECTS with 400 + `requires_transfer:true` and the current summary. Admin must
// drain the pipeline via POST .../transfer-assets first. The cascade safety net stays in
// `cascadeOnAgentDeactivation` but is no longer the primary UX path.
router.patch('/members/:id/deactivate', checkPermission('manage_settings'), async (req, res) => {
    const id = String(req.params.id);
    const { status } = req.body; // 'active' or 'inactive'

    if (id === req.agent!.id) {
        return res.status(400).json({ error: 'Cannot change your own status' });
    }

    try {
        if (status === 'inactive') {
            const summary = await ownershipService.getOwnershipSummary(id);
            const total =
                summary.partners + summary.inventory + summary.contacts + summary.leads + summary.transactions;

            if (total > 0) {
                return res.status(400).json({
                    error: `This agent still owns ${total} assets. Use 'Transfer Assets' to redistribute their pipeline first.`,
                    requires_transfer: true,
                    summary,
                });
            }

            // Clean — just flip the status. No cascade needed.
            const agent = await prisma.agent.update({
                where: { id },
                data: { status: 'inactive' },
                select: { id: true, name: true, email: true, status: true },
            });
            logger.warn(`[Team] Agent ${id} deactivated (assets already drained).`);
            return res.json({
                ...agent,
                message: 'Account inactive.',
                cascade: { partners: 0, inventory: 0, contacts: 0, leads: 0, transactions: 0 },
            });
        }

        // Reactivation path (status='active' or any other value) — unchanged
        const agent = await prisma.agent.update({
            where: { id },
            data: { status: status === 'active' ? 'active' : 'inactive' },
            select: { id: true, name: true, email: true, status: true },
        });
        res.json({ ...agent, message: `Account ${agent.status}` });
    } catch (error) {
        captureRouteError(error, req, { route: 'team#9' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/team/members/:id/ownership-summary — preview cascade impact for the admin UI.
// Super_boss only (because the answer reveals cross-team asset ownership).
router.get('/members/:id/ownership-summary', requireSuperBoss, async (req, res) => {
    try {
        const summary = await ownershipService.getOwnershipSummary(req.params.id);
        res.json(summary);
    } catch (error) {
        captureRouteError(error, req, { route: 'team#10' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// PATCH /api/team/members/:id/reset-password - Reset member password + send setup link
router.patch('/members/:id/reset-password', checkPermission('manage_team'), async (req, res) => {
    const { id } = req.params;

    try {
        const agent = await prisma.agent.findUnique({
            where: { id },
            select: { id: true, email: true, name: true, phone: true, role: true, department: true, tenant_id: true }
        });
        if (!agent) return res.status(404).json({ error: 'Agent not found' });

        const newPassword = generateTempPassword();
        const hash = await bcrypt.hash(newPassword, 10);

        // Generate setup token so they can set their own password
        const setupToken = randomUUID();
        const setupExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000);

        await prisma.agent.update({
            where: { id },
            data: { password_hash: hash, setup_token: setupToken, setup_token_expires: setupExpiry },
        });

        // Update email mailbox password too
        emailProvisioner.updatePassword(agent.email, newPassword).catch(() => {});

        const setupLink = `${ADMIN_PANEL_URL}/setup-password?token=${setupToken}`;

        // Send setup link via WhatsApp (non-blocking)
        if (agent.phone) {
            sendWelcomeWhatsApp(agent.phone, agent.name, agent.role, agent.department, agent.email, setupLink, agent.tenant_id)
                .catch(err => logger.warn(`[Team] WhatsApp reset link failed for ${agent.phone}: ${err.message}`));
        }

        res.json({
            message: 'Password reset successfully. Setup link sent to WhatsApp.',
            name: agent.name,
            email: agent.email,
            newPassword,
            setupLink,
            note: agent.phone ? 'A password setup link has been sent to their WhatsApp.' : 'No phone on file — share the password manually.',
        });
    } catch (error) {
        captureRouteError(error, req, { route: 'team#11' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// PATCH /api/team/members/:id/set-password - Boss sets custom password for a team member
router.patch('/members/:id/set-password', checkPermission('manage_team'), async (req, res) => {
    const { id } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    // Can't set own password via this route
    if (id === req.agent!.id) {
        return res.status(400).json({ error: 'Use forgot-password to reset your own password.' });
    }

    try {
        const target = await prisma.agent.findUnique({
            where: { id },
            select: { id: true, name: true, email: true, role: true, tenant_id: true },
        });
        if (!target) return res.status(404).json({ error: 'Agent not found' });

        // Boss restriction: can't set password for users with higher role
        const roleRank: Record<string, number> = { super_boss: 3, manager: 2, employee: 1 };
        const creatorRank = roleRank[req.agent!.role] || 0;
        const targetRank = roleRank[target.role] || 0;
        if (targetRank > creatorRank) {
            return res.status(403).json({ error: 'Cannot set password for users with higher role.' });
        }

        // Hash and update
        const hash = await bcrypt.hash(password, 10);
        await prisma.agent.update({
            where: { id },
            data: { password_hash: hash },
        });

        // Audit trail
        try {
            await prisma.agentActionLog.create({
                data: {
                    tenant_id: req.agent!.tenant_id,
                    agent_name: 'AdminAgent',
                    action: 'set_password',
                    phone_number: target.email,
                    status: 'success',
                    details: { set_by: req.agent!.id, target_name: target.name, target_role: target.role },
                },
            });
        } catch { /* non-blocking audit */ }

        logger.info(`[Team] Password set for ${target.name} (${target.email}) by ${req.agent!.id}`);
        res.json({ success: true, message: `Password updated for ${target.name}.` });
    } catch (error) {
        captureRouteError(error, req, { route: 'team#12' });
        logger.error('Set password error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /api/team/members/:id/resend-setup - Resend WhatsApp welcome with fresh setup link
router.post('/members/:id/resend-setup', checkPermission('manage_team'), async (req, res) => {
    const { id } = req.params;

    try {
        const agent = await prisma.agent.findUnique({
            where: { id },
            select: { id: true, name: true, email: true, phone: true, role: true, department: true, tenant_id: true, status: true },
        });
        if (!agent) return res.status(404).json({ error: 'Agent not found' });
        if (agent.status !== 'active') return res.status(400).json({ error: 'Agent is inactive' });
        if (!agent.phone) return res.status(400).json({ error: 'Agent has no phone number' });

        // Generate fresh setup token (48h)
        const setupToken = randomUUID();
        const setupExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000);
        await prisma.agent.update({
            where: { id },
            data: { setup_token: setupToken, setup_token_expires: setupExpiry },
        });

        const setupLink = `${ADMIN_PANEL_URL}/setup-password?token=${setupToken}`;

        await sendWelcomeWhatsApp(agent.phone, agent.name, agent.role, agent.department, agent.email, setupLink, agent.tenant_id);

        logger.info(`[Team] Resent setup link for ${agent.name} (${agent.phone})`);
        res.json({ success: true, message: `Setup link resent to ${agent.phone}`, setupLink });
    } catch (error) {
        captureRouteError(error, req, { route: 'team#13' });
        logger.error('Resend setup link error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/team/members-without-phone - Count active agents with no phone
router.get('/members-without-phone', checkPermission('manage_team'), async (req, res) => {
    try {
        const count = await prisma.agent.count({
            where: {
                tenant_id: req.agent!.tenant_id,
                status: 'active',
                OR: [{ phone: null }, { phone: '' }],
            },
        });
        res.json({ count });
    } catch (error) {
        captureRouteError(error, req, { route: 'team#14' });
        res.status(500).json({ error: (error as Error).message });
    }
});

// =============================================================
// BULK INVENTORY UPLOAD
// =============================================================

// POST /api/team/inventory/bulk-upload - Upload CSV of properties
router.post('/inventory/bulk-upload', checkPermission('bulk_upload'), upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'CSV file required. Field name: file' });
    }

    const results = { imported: 0, skipped: 0, errors: [] as string[] };

    try {
        const csvContent = req.file.buffer.toString('utf-8');
        const records = parse(csvContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
        });

        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return res.status(500).json({ error: 'Tenant configuration missing' });

        for (let i = 0; i < records.length; i++) {
            const row = records[i];
            const rowNum = i + 2; // 1-based, +1 for header

            // Required fields validation
            if (!row.owner_phone) {
                results.errors.push(`Row ${rowNum}: owner_phone is required`);
                results.skipped++;
                continue;
            }
            if (!row.type) {
                results.errors.push(`Row ${rowNum}: type is required (flat, house, plot, office, shop)`);
                results.skipped++;
                continue;
            }
            if (!row.intent) {
                results.errors.push(`Row ${rowNum}: intent is required (sell, rent, lease)`);
                results.skipped++;
                continue;
            }

            try {
                const ownerPhone = row.owner_phone.startsWith('+') ? row.owner_phone : `+91${row.owner_phone.replace(/^0+/, '')}`;

                // SSOT: Upsert Contact
                await prisma.contact.upsert({
                    where: { phone_number: ownerPhone },
                    create: {
                        phone_number: ownerPhone,
                        tenant_id: tenant.id,
                        name: row.owner_name || null,
                        contact_type: 'LANDLORD',
                        source: 'bulk_upload',
                        created_by: req.agent?.id || null,
                    },
                    update: {
                        contact_type: 'LANDLORD'
                    }
                });

                // Build specs object
                const specs: any = {};
                if (row.bedrooms) specs.bedrooms = parseInt(row.bedrooms);
                if (row.bathrooms) specs.bathrooms = parseInt(row.bathrooms);
                if (row.area) specs.area = parseFloat(row.area);
                if (row.area_unit) specs.area_unit = row.area_unit;

                // Resolve classification slugs to IDs (optional columns)
                let categoryId: string | undefined;
                let subCategoryId: string | undefined;
                let typeId: string | undefined;
                let configurationId: string | undefined;

                if (row.category_slug) {
                    const cat = await prisma.propertyCategory.findFirst({ where: { slug: row.category_slug } });
                    if (cat) categoryId = cat.id;
                }
                if (row.sub_category_slug && categoryId) {
                    const subCat = await prisma.propertySubCategory.findFirst({ where: { slug: row.sub_category_slug, category_id: categoryId } });
                    if (subCat) subCategoryId = subCat.id;
                }
                if (row.type_slug && subCategoryId) {
                    const typ = await prisma.propertyType.findFirst({ where: { slug: row.type_slug, sub_category_id: subCategoryId } });
                    if (typ) typeId = typ.id;
                }
                if (row.configuration_slug) {
                    const config = await prisma.propertyConfiguration.findFirst({ where: { slug: row.configuration_slug } });
                    if (config) configurationId = config.id;
                }

                // Parse amenities (comma-separated) into features JSON
                let features: Record<string, boolean> | undefined;
                if (row.amenities) {
                    features = {};
                    const amenityWords = row.amenities.toLowerCase().split(/[,;\s]+/);
                    const AMENITY_MAP: Record<string, string> = {
                        'parking': 'parking', 'lift': 'lift', 'garden': 'garden',
                        'pool': 'pool', 'gym': 'gym', 'security': 'security',
                        'power_backup': 'power_backup', 'water_supply': 'water_supply',
                        'club_house': 'club_house', 'intercom': 'intercom',
                        'gas_pipeline': 'gas_pipeline', 'park': 'park',
                    };
                    for (const w of amenityWords) {
                        const key = AMENITY_MAP[w.trim()];
                        if (key) features[key] = true;
                    }
                    if (Object.keys(features).length === 0) features = undefined;
                }

                // Ensure Owner exists for this phone (creates if needed)
                const ownerId = await ensureOwner(ownerPhone, tenant.id);

                // Compute structured address + legacy location
                const csvState = row.state || undefined;
                const csvDistrict = row.district || undefined;
                const csvLocality = row.locality || undefined;
                const csvPincode = row.pincode || undefined;
                const csvLocation = row.location || (csvLocality && csvDistrict ? `${csvLocality}, ${csvDistrict}` : csvLocality || csvDistrict || null);
                const csvFullAddress = [csvLocality, csvDistrict, csvState, csvPincode ? `- ${csvPincode}` : '']
                    .filter(Boolean).join(', ').replace(', -', ' -') || undefined;

                // Compute raw price from price + price_unit
                let csvPrice: number | null = row.price ? parseFloat(row.price) : null;
                if (csvPrice && row.price_unit) {
                    if (row.price_unit.toLowerCase() === 'lakh') csvPrice *= 100000;
                    else if (row.price_unit.toLowerCase() === 'crore') csvPrice *= 10000000;
                }

                // Fold dropped columns (furnishing/facing/property_age/total_floors/features)
                // into specs.* (SoT since 2026-05-28) — writing the columns would throw.
                if (row.furnishing) specs.furnishing = row.furnishing;
                if (row.facing) specs.facing = row.facing;
                if (row.property_age) specs['age-of-construction'] = row.property_age;
                if (row.total_floors) specs.floors = parseInt(row.total_floors) || undefined;
                // features is a {slug:true} map in the CSV path → specs.amenities expects an array.
                if (features && Object.keys(features).length) specs.amenities = Object.keys(features);

                // Create inventory record
                await prisma.inventory.create({
                    data: {
                        tenant_id: tenant.id,
                        owner_id: ownerId,
                        owner_phone: ownerPhone,
                        category: row.category || 'residential',
                        type: row.type,
                        intent: row.intent,
                        location: csvLocation,
                        price: csvPrice,
                        price_unit: row.price_unit || undefined,
                        status: row.status || 'active',
                        specs: Object.keys(specs).length > 0 ? specs : null,
                        media_urls: [],
                        uploaded_by_agent_id: req.agent!.id,

                        // Classification IDs (resolved from slugs)
                        category_id: categoryId,
                        sub_category_id: subCategoryId,
                        type_id: typeId,
                        configuration_id: configurationId,

                        // Structured address fields
                        state: csvState,
                        district: csvDistrict,
                        locality: csvLocality,
                        pincode: csvPincode,
                        full_address: csvFullAddress,

                        // furnishing/facing/property_age/total_floors/features folded into specs above.
                        floor_number: row.floor_number ? parseInt(row.floor_number) : undefined,
                        description: row.description || undefined,

                        // Key holder
                        key_holder_type: row.key_holder_type || undefined,
                        key_holder_name: row.key_holder_name || undefined,
                        key_holder_phone: row.key_holder_phone || undefined,
                    }
                });

                // Log interaction
                await prisma.interaction.create({
                    data: {
                        tenant_id: tenant.id,
                        phone_number: ownerPhone,
                        channel: 'admin',
                        direction: 'inbound',
                        event_type: 'inventory_bulk_uploaded',
                        content: `Bulk upload: ${row.type} in ${row.location || 'unknown'}, ${row.intent}`,
                        metadata: { uploaded_by: req.agent!.id, row: rowNum }
                    }
                });

                results.imported++;
            } catch (rowError: any) {
                results.errors.push(`Row ${rowNum}: ${rowError.message}`);
                results.skipped++;
            }
        }

        res.json({
            ...results,
            total: records.length,
            message: `Imported ${results.imported} of ${records.length} properties.`
        });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'team#15' });
        logger.error('Bulk upload error:', error);
        res.status(400).json({ error: `CSV parse error: ${error.message}` });
    }
});

// NOTE: bulk-template route is defined above (before auth middleware) for public access

// =============================================================
// HELPERS
// =============================================================

/**
 * Send WhatsApp welcome message with password setup link to new team member.
 */
async function sendWelcomeWhatsApp(
    phone: string, name: string, role: string,
    department: string | null, email: string,
    setupLink: string, tenantId: string,
    managerName: string = 'your manager',
): Promise<void> {
    const roleLabel = role === 'super_boss' ? 'Super Boss' : role === 'manager' ? 'Manager' : 'Team Member';
    const deptLine = department ? ` in *${department}*` : '';

    // WhatsApp Cloud API expects phone without '+' prefix
    const waPhone = phone.replace(/^\+/, '');

    // Send template first (opens 24h session window)
    await whatsappService.sendTemplate(waPhone, 'rp_team_welcome', { name, manager: managerName });

    // Follow up with the actual setup link as a text message
    const setupMessage = `Hi *${name}*! 👋\n\nYou've been added as *${roleLabel}*${deptLine} at Realty Pandit.\n\n📧 Email: ${email}\n\n🔐 *Set your password here:*\n${setupLink}\n\n⏳ This link is valid for *48 hours*. Click it to create your password and start using the admin panel.`;
    await whatsappService.sendText(waPhone, setupMessage);

    // SSOT: Log welcome message as interaction
    try {
        await prisma.interaction.create({
            data: {
                tenant_id: tenantId,
                phone_number: phone,
                channel: 'whatsapp',
                direction: 'outbound',
                event_type: 'welcome_message_sent',
                content: `Welcome message sent to ${name} with password setup link`,
                metadata: { email, role, setup_link_sent: true },
            },
        });
    } catch (err) {
        logger.warn(`[Team] Failed to log welcome interaction: ${(err as Error).message}`);
    }
}

function generateTempPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#$';
    let password = '';
    for (let i = 0; i < 12; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

export default router;
