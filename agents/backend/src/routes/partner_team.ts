/**
 * PARTNER TEAMS — a partner COMPANY manages its own sub-agents. (2026-07-13)
 *
 * Mounted at /api/partner/* behind `authMiddleware` + the PARTNER_ALLOWLIST default-deny backbone
 * (deliberately NOT under /agent/*, which bypassed the allow-list entirely and is now retired).
 *
 * Every route here is OWNER-ONLY (`requirePartnerOwner`): an ACTIVE partner whose partner_category is
 * COMPANY and who has no parent. Sub-agents are created as INDIVIDUAL with a parent, so they can never
 * pass that check — a sub-agent can work what they're given but can never manage the team.
 *
 * ⚠ Agent-FK trap: Contact.created_by is an FK to `agents` (our internal staff). A PartnerAgent id there
 * is a Prisma FK violation. Partner-created contacts are attributed to the partner's COORDINATOR.
 */
import { Router } from 'express';
import prisma from '../db';
import logger from '../utils/logger';
import { authMiddleware } from '../middleware/auth';
import { requirePartnerOwner } from '../utils/partner_team';
import { normalizePhone } from '../utils/phone';
import { captureRouteError } from '../utils/capture';

const router = Router();

/** GET /api/partner/team — the owner's sub-agents, with a workload count each. */
router.get('/team', authMiddleware, async (req: any, res) => {
    try {
        const caller = await requirePartnerOwner(req, res);
        if (!caller) return;

        const subs = await prisma.partnerAgent.findMany({
            where: { parent_partner_id: caller.id },
            orderBy: { created_at: 'desc' },
            select: {
                id: true, name: true, phone_number: true, email: true,
                status: true, created_at: true,
            },
        });

        // Workload per member: what is ASSIGNED to them (not what they referred).
        const ids = subs.map(s => s.id);
        const [leadCounts, dealCounts, invCounts] = ids.length
            ? await Promise.all([
                prisma.contact.groupBy({ by: ['partner_assignee_id'], where: { partner_assignee_id: { in: ids } }, _count: { _all: true } }),
                prisma.transaction.groupBy({ by: ['partner_assignee_id'], where: { partner_assignee_id: { in: ids } }, _count: { _all: true } }),
                prisma.inventory.groupBy({ by: ['partner_assignee_id'], where: { partner_assignee_id: { in: ids } }, _count: { _all: true } }),
            ])
            : [[], [], []];
        const tally = (rows: any[]) => Object.fromEntries(rows.map(r => [r.partner_assignee_id, r._count._all]));
        const L = tally(leadCounts as any[]), D = tally(dealCounts as any[]), I = tally(invCounts as any[]);

        res.json({
            members: subs.map(s => ({
                ...s,
                assigned_leads: L[s.id] || 0,
                assigned_deals: D[s.id] || 0,
                assigned_listings: I[s.id] || 0,
            })),
        });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'partner_team#list' });
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/partner/team/assignable — roster for the "Assign to teammate" dropdowns.
 * Owner first, then ACTIVE sub-agents only. Suspended members are deliberately excluded HERE
 * (never from the scope helpers — see partner_scope.ts, removing them there would make the owner's
 * assigned rows vanish).
 */
router.get('/team/assignable', authMiddleware, async (req: any, res) => {
    try {
        const caller = await requirePartnerOwner(req, res);
        if (!caller) return;

        const me = await prisma.partnerAgent.findUnique({
            where: { id: caller.id }, select: { id: true, name: true },
        });
        const subs = await prisma.partnerAgent.findMany({
            where: { parent_partner_id: caller.id, status: 'ACTIVE' },
            orderBy: { name: 'asc' },
            select: { id: true, name: true },
        });

        res.json({
            members: [
                { id: me!.id, name: `${me!.name} (me)`, is_owner: true },
                ...subs.map(s => ({ id: s.id, name: s.name, is_owner: false })),
            ],
        });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'partner_team#assignable' });
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/partner/team — add a sub-agent {name, phone, email?}.
 * They can sign in IMMEDIATELY at the same admin URL with their phone (WhatsApp OTP) — no invite,
 * no password to set. Login already hard-rejects non-ACTIVE partners.
 */
router.post('/team', authMiddleware, async (req: any, res) => {
    try {
        const caller = await requirePartnerOwner(req, res);
        if (!caller) return;

        const name = (req.body?.name ?? '').toString().trim();
        const phoneRaw = (req.body?.phone ?? '').toString().trim();
        const email = (req.body?.email ?? '').toString().trim() || null;
        if (!name || !phoneRaw) return res.status(400).json({ error: 'Name and phone are required.' });

        const phone = normalizePhone(phoneRaw);
        if (!phone) return res.status(400).json({ error: 'That phone number is not valid.' });

        const existing = await prisma.partnerAgent.findUnique({ where: { phone_number: phone }, select: { id: true } });
        if (existing) return res.status(409).json({ error: 'That phone number is already registered.' });

        const owner = await prisma.partnerAgent.findUnique({
            where: { id: caller.id },
            select: { business_name: true, business_address: true, package_type: true, managing_agent_id: true },
        });
        const tenant = await prisma.tenant.findFirst({ select: { id: true } });
        if (!tenant) return res.status(500).json({ error: 'System not configured' });

        // Contact.created_by is an Agent FK — attribute to the partner's coordinator, NEVER the partner id.
        await prisma.contact.upsert({
            where: { phone_number: phone },
            create: {
                phone_number: phone,
                tenant_id: tenant.id,
                name,
                email: email || undefined,
                contact_type: 'PARTNER_AGENT',
                source: 'partner_team_created',
                created_by: owner?.managing_agent_id || null,
            },
            update: { name, contact_type: 'PARTNER_AGENT' },
        });

        const sub = await prisma.partnerAgent.create({
            data: {
                phone_number: phone,
                name,
                email,
                // INDIVIDUAL + a parent is what structurally prevents a sub-agent from ever being an owner.
                partner_category: 'INDIVIDUAL',
                parent_partner_id: caller.id,
                managing_agent_id: owner?.managing_agent_id ?? null,
                business_name: owner?.business_name ?? null,
                business_address: owner?.business_address ?? null,
                package_type: owner?.package_type,
                status: 'ACTIVE',
                verified: true,
                onboarded_at: new Date(),
            },
            select: { id: true, name: true, phone_number: true, email: true, status: true, created_at: true },
        });

        logger.info(`[PartnerTeam] Owner ${caller.id} added sub-agent ${sub.id} (${phone})`);
        res.status(201).json({ ...sub, assigned_leads: 0, assigned_deals: 0, assigned_listings: 0 });
    } catch (err: any) {
        captureRouteError(err, req, { route: 'partner_team#add' });
        if (err.code === 'P2002') return res.status(409).json({ error: 'That phone number is already registered.' });
        res.status(500).json({ error: err.message });
    }
});

/** PATCH /api/partner/team/:subId — suspend / reactivate / rename one of THEIR OWN sub-agents. */
router.patch('/team/:subId', authMiddleware, async (req: any, res) => {
    try {
        const caller = await requirePartnerOwner(req, res);
        if (!caller) return;

        const sub = await prisma.partnerAgent.findUnique({
            where: { id: req.params.subId },
            select: { id: true, parent_partner_id: true },
        });
        // Non-enumerating: same message whether it doesn't exist or belongs to another partner.
        if (!sub || sub.parent_partner_id !== caller.id) {
            logger.warn(`[PartnerTeam] Partner ${caller.id} tried to modify non-member ${req.params.subId}`);
            return res.status(403).json({ error: 'That person is not a member of your team.' });
        }

        const data: any = {};
        const status = req.body?.status;
        if (status !== undefined) {
            if (!['ACTIVE', 'SUSPENDED'].includes(status)) {
                return res.status(400).json({ error: 'status must be ACTIVE or SUSPENDED' });
            }
            data.status = status;
        }
        if (req.body?.name !== undefined) {
            const n = String(req.body.name).trim();
            if (!n) return res.status(400).json({ error: 'Name cannot be empty.' });
            data.name = n;
        }
        if (req.body?.email !== undefined) data.email = String(req.body.email).trim() || null;
        if (!Object.keys(data).length) return res.status(400).json({ error: 'Nothing to update.' });

        const updated = await prisma.partnerAgent.update({
            where: { id: sub.id },
            data,
            select: { id: true, name: true, phone_number: true, email: true, status: true, created_at: true },
        });
        logger.info(`[PartnerTeam] Owner ${caller.id} updated sub-agent ${sub.id}: ${JSON.stringify(data)}`);
        res.json(updated);
    } catch (err: any) {
        captureRouteError(err, req, { route: 'partner_team#update' });
        res.status(500).json({ error: err.message });
    }
});

export default router;
