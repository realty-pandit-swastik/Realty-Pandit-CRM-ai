
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../db';

if (!process.env.JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET environment variable is not set');
}
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '24h';
const REFRESH_EXPIRES_IN = '7d';

export class AuthService {

    public async register(name: string, email: string, password: string, role: string, tenantId: string, reportsToId?: string) {
        // Check if email already exists
        const existing = await prisma.agent.findUnique({ where: { email } });
        if (existing) {
            throw new Error('Email already registered');
        }

        const password_hash = await bcrypt.hash(password, 10);

        const agent = await prisma.agent.create({
            data: {
                name,
                email,
                password_hash,
                role,
                tenant_id: tenantId,
                reports_to_id: reportsToId || null
            }
        });

        return { id: agent.id, name: agent.name, email: agent.email, role: agent.role };
    }

    public async login(email: string, password: string) {
        const agent = await prisma.agent.findUnique({ where: { email } });
        if (!agent || !agent.password_hash) {
            throw new Error('Invalid credentials');
        }

        const valid = await bcrypt.compare(password, agent.password_hash);
        if (!valid) {
            throw new Error('Invalid credentials');
        }

        if (agent.status === 'inactive') {
            throw new Error('Account deactivated. Contact your administrator.');
        }

        const token = jwt.sign(
            { id: agent.id, email: agent.email, role: agent.role, tenant_id: agent.tenant_id },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        const refreshToken = jwt.sign(
            { id: agent.id },
            JWT_SECRET,
            { expiresIn: REFRESH_EXPIRES_IN }
        );

        // Save refresh token and last login
        await prisma.agent.update({
            where: { id: agent.id },
            data: { refresh_token: refreshToken, last_login_at: new Date() }
        });

        return {
            token,
            refreshToken,
            agent: { id: agent.id, name: agent.name, email: agent.email, role: agent.role }
        };
    }

    public async loginByPhone(phone: string, password: string) {
        const agent = await prisma.agent.findFirst({
            where: { phone, status: 'active' },
        });
        if (!agent || !agent.password_hash) {
            throw new Error('Invalid credentials');
        }

        const valid = await bcrypt.compare(password, agent.password_hash);
        if (!valid) {
            throw new Error('Invalid credentials');
        }

        const token = jwt.sign(
            { id: agent.id, email: agent.email, role: agent.role, tenant_id: agent.tenant_id },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        const refreshToken = jwt.sign(
            { id: agent.id },
            JWT_SECRET,
            { expiresIn: REFRESH_EXPIRES_IN }
        );

        await prisma.agent.update({
            where: { id: agent.id },
            data: { refresh_token: refreshToken, last_login_at: new Date() }
        });

        return {
            token,
            refreshToken,
            agent: { id: agent.id, name: agent.name, email: agent.email, role: agent.role }
        };
    }

    /**
     * P1b — sign in a member via their connected Google account.
     *
     * Gate: the member must have ALREADY linked Google from their profile
     * (P1) — we require a stored google_refresh_token, which is only ever set
     * by the authenticated /api/team/me/google connect flow. No password:
     * Google has already authenticated them and we matched the verified email.
     */
    public async loginByGoogleEmail(googleEmail: string) {
        const agent = await prisma.agent.findFirst({
            where: {
                status: 'active',
                google_refresh_token: { not: null },
                google_email: { equals: googleEmail, mode: 'insensitive' },
            },
        });
        if (!agent) {
            throw new Error(
                'This Google account is not linked to an active team member. Log in with your phone number, then connect Google from your profile first.'
            );
        }

        const token = jwt.sign(
            { id: agent.id, email: agent.email, role: agent.role, tenant_id: agent.tenant_id },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        const refreshToken = jwt.sign(
            { id: agent.id },
            JWT_SECRET,
            { expiresIn: REFRESH_EXPIRES_IN }
        );

        await prisma.agent.update({
            where: { id: agent.id },
            data: { refresh_token: refreshToken, last_login_at: new Date() }
        });

        return {
            token,
            refreshToken,
            agent: { id: agent.id, name: agent.name, email: agent.email, role: agent.role }
        };
    }

    /**
     * Google sign-in for an EXTERNAL PARTNER AGENT (2026-07-12).
     * Google has already verified the email; we match it against the partner's email on file and
     * issue the same admin-recognized `role:'partner'` session the OTP/password logins issue.
     * (PartnerAgent has no google_refresh_token column, so unlike the team there is no separate
     * "connect" step — having the email on the partner record IS the link.)
     */
    public async loginPartnerByGoogleEmail(googleEmail: string) {
        const partner = await prisma.partnerAgent.findFirst({
            where: {
                status: 'ACTIVE',
                email: { equals: googleEmail, mode: 'insensitive' },
            },
            select: {
                id: true, name: true, email: true, phone_number: true,
                partner_category: true, parent_partner_id: true,
            },
        });
        if (!partner) {
            throw new Error('This Google account is not linked to an active partner agent.');
        }

        const tenant = await prisma.tenant.findFirst({ select: { id: true } });
        const token = jwt.sign(
            {
                id: partner.id,
                email: partner.email || '',
                role: 'partner',
                tenant_id: tenant?.id,
                phone: partner.phone_number,
                partner_category: partner.partner_category,
                parent_partner_id: partner.parent_partner_id,
            },
            JWT_SECRET,
            { expiresIn: '7d' },
        );

        return {
            token,
            refreshToken: undefined as string | undefined,
            agent: { id: partner.id, name: partner.name, email: partner.email, role: 'partner' },
        };
    }

    public verifyToken(token: string): any {
        return jwt.verify(token, JWT_SECRET);
    }

    public async refreshToken(token: string) {
        const decoded: any = jwt.verify(token, JWT_SECRET);
        const agent = await prisma.agent.findUnique({ where: { id: decoded.id } });

        if (!agent || agent.refresh_token !== token) {
            throw new Error('Invalid refresh token');
        }

        const newToken = jwt.sign(
            { id: agent.id, email: agent.email, role: agent.role, tenant_id: agent.tenant_id },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        return { token: newToken };
    }
}
