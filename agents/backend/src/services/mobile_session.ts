import { createHash, randomBytes, randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt, { JwtPayload } from 'jsonwebtoken';
import prisma from '../db';
import { AuthError } from '../middleware/error_handler';
import { normalizePhone } from '../utils/phone';
import { getAllPermissions } from '../config/permissions';

const ISSUER = 'realty-pandit';
const ACCESS_AUDIENCE = 'rp-mobile-access';
const REFRESH_AUDIENCE = 'rp-mobile-refresh';
const STAFF_ROLES = new Set(['super_boss', 'manager', 'employee']);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const secret = () => {
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');
    return process.env.JWT_SECRET;
};

type StaffIdentity = { id: string; tenant_id: string; name: string; email: string; role: string; status: string };

function issue(session: { id: string; expires_at: Date }, agent: StaffIdentity) {
    const token = jwt.sign({
        id: agent.id, email: agent.email, role: agent.role, tenant_id: agent.tenant_id,
        mobile_session_id: session.id, token_use: 'mobile_access',
    }, secret(), { algorithm: 'HS256', issuer: ISSUER, audience: ACCESS_AUDIENCE, expiresIn: '10m' });
    const refreshToken = jwt.sign({ token_use: 'mobile_refresh' }, secret(), {
        algorithm: 'HS256', issuer: ISSUER, audience: REFRESH_AUDIENCE,
        subject: session.id, jwtid: randomBytes(32).toString('hex'),
        expiresIn: Math.max(1, Math.floor((session.expires_at.getTime() - Date.now()) / 1000)),
    });
    return {
        token, refreshToken, sessionId: session.id,
        agent: { id: agent.id, tenant_id: agent.tenant_id, name: agent.name, email: agent.email,
            role: agent.role, permissions: getAllPermissions(agent.role) },
    };
}

export async function createMobileSession(phone: string, password: string, deviceName: string) {
    const agent = await prisma.agent.findFirst({ where: { phone: normalizePhone(phone), status: 'active', tenant: { status: 'active' } } });
    if (!agent?.password_hash || !STAFF_ROLES.has(agent.role) || !await bcrypt.compare(password, agent.password_hash)) {
        throw new AuthError('Invalid credentials');
    }
    const session = { id: randomUUID(), expires_at: new Date(Date.now() + 30 * 86400_000) };
    const result = issue(session, agent);
    await prisma.mobileSession.create({ data: {
        ...session, agent_id: agent.id, tenant_id: agent.tenant_id,
        device_name: deviceName, refresh_hash: hash(result.refreshToken),
    } });
    return result;
}

export async function refreshMobileSession(refreshToken: string) {
    let decoded: JwtPayload;
    try {
        const value = jwt.verify(refreshToken, secret(), {
            algorithms: ['HS256'], issuer: ISSUER, audience: REFRESH_AUDIENCE,
        });
        if (typeof value === 'string' || value.token_use !== 'mobile_refresh' || !value.sub || !value.jti) throw new Error();
        decoded = value;
    } catch { throw new AuthError('Session expired. Sign in again.'); }
    const session = await prisma.mobileSession.findUnique({ where: { id: decoded.sub }, include: { agent: { include: { tenant: { select: { status: true } } } } } });
    if (!session || session.revoked_at || session.expires_at <= new Date()) throw new AuthError('Session expired. Sign in again.');
    const agent = session.agent;
    if (agent.status !== 'active' || agent.tenant.status !== 'active' || !STAFF_ROLES.has(agent.role) || agent.tenant_id !== session.tenant_id) {
        await prisma.mobileSession.update({ where: { id: session.id }, data: { revoked_at: new Date() } });
        throw new AuthError('Account access changed. Sign in again.');
    }
    const result = issue(session, agent);
    // A signed stale credential is a replay. CAS also detects simultaneous refreshes across workers.
    const rotated = await prisma.mobileSession.updateMany({ where: {
        id: session.id, refresh_hash: hash(refreshToken), revoked_at: null, expires_at: { gt: new Date() },
    }, data: { refresh_hash: hash(result.refreshToken), refreshed_at: new Date() } });
    if (rotated.count !== 1) {
        await prisma.mobileSession.updateMany({ where: { id: session.id }, data: { revoked_at: new Date() } });
        throw new AuthError('Session credential was reused. Sign in again.');
    }
    return result;
}

export async function verifyMobileAccess(decoded: JwtPayload) {
    if (decoded.token_use !== 'mobile_access' || decoded.aud !== ACCESS_AUDIENCE || decoded.iss !== ISSUER ||
        typeof decoded.mobile_session_id !== 'string') throw new AuthError();
    const session = await prisma.mobileSession.findUnique({ where: { id: decoded.mobile_session_id }, include: { agent: { include: { tenant: { select: { status: true } } } } } });
    if (!session || session.revoked_at || session.expires_at <= new Date() ||
        session.agent_id !== decoded.id || session.tenant_id !== decoded.tenant_id ||
        session.agent.tenant_id !== decoded.tenant_id || session.agent.role !== decoded.role ||
        session.agent.status !== 'active' || session.agent.tenant.status !== 'active') throw new AuthError();
}
