
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
