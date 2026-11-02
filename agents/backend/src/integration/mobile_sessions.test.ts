import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import mobileAuth from '../routes/mobile_auth';
import browserAuth from '../routes/auth';
import { authMiddleware } from '../middleware/auth';
import { mobileCredentialBoundary } from '../middleware/mobile_credential_boundary';
import { csrfMiddleware } from '../middleware/csrf';
import { AuthService } from '../services/auth';
import { AppError } from '../middleware/error_handler';
import { refreshMobileSession } from '../services/mobile_session';
import prisma from '../db';
import workflow from '../routes/workflow';
import { WorkflowEngine } from '../workflows/workflow_engine';

// Keep real routing/authentication; stop at the workflow's persistence/provider boundary.
const commit = vi.spyOn(WorkflowEngine.prototype, 'commit').mockResolvedValue({ inventory_id: 'synthetic', display_id: 'synthetic', completion_pct: 0 });

const db = new PrismaClient();
const tenantId = 'mobile-test-tenant';
const agentId = 'mobile-test-agent';
const phone = '+919000000001';
const partnerId = 'mobile-test-partner', partnerPhone = '+919000000011';
const app = express();
app.set('trust proxy', 1);
app.use(cookieParser(), mobileCredentialBoundary, csrfMiddleware, express.json());
app.use('/auth/mobile', mobileAuth);
app.use('/auth', browserAuth);
app.get('/protected', authMiddleware, (req, res) => res.json(req.agent));
app.get('/api/reports/private', authMiddleware, (_req, res) => res.json({ ok: true }));
app.post('/public/optional-identity', (_req, res) => res.json({ ok: true }));
app.use('/api/workflow', workflow);
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error instanceof AppError ? error.statusCode : 500).json({ error: error instanceof AppError ? error.message : 'Internal error' });
});

let loginIp = 1;
async function login() {
    const result = await request(app).post('/auth/mobile/login').set('X-Forwarded-For', `192.0.2.${loginIp++}`).send({ phone, password: 'Synthetic-password-1', deviceName: 'Synthetic device' });
    if (result.status !== 200) throw new Error(`Synthetic staff login failed (${result.status}): ${result.body.error || 'no safe error'}`);
    expect(result.headers['set-cookie']).toBeUndefined();
    return result.body as { token: string; refreshToken: string; sessionId: string };
}
const access = (token: string) => request(app).get('/protected').auth(token, { type: 'bearer' });

beforeAll(async () => {
    await db.tenant.create({ data: { id: tenantId, business_name: 'Synthetic mobile test', owner_name: 'Synthetic', primary_phone: phone } });
    await db.agent.create({ data: { id: agentId, tenant_id: tenantId, name: 'Synthetic member', email: 'mobile-synthetic@example.invalid', phone,
        role: 'employee', status: 'active', password_hash: await bcrypt.hash('Synthetic-password-1', 4), refresh_token: 'browser-slot-untouched' } });
    await db.contact.create({ data: { phone_number: partnerPhone, tenant_id: tenantId, name: 'Synthetic partner' } });
    await db.partnerAgent.create({ data: { id: partnerId, phone_number: partnerPhone, name: 'Synthetic partner', email: 'partner-mobile@example.invalid', status: 'ACTIVE' } });
});
beforeEach(async () => {
    commit.mockClear();
    await db.tenant.update({ where: { id: tenantId }, data: { status: 'active' } });
    await db.mobileSession.deleteMany({ where: { agent_id: agentId } });
    await db.agent.update({ where: { id: agentId }, data: { status: 'active', role: 'employee', tenant_id: tenantId, refresh_token: 'browser-slot-untouched' } });
});
afterAll(async () => {
    await db.partnerAgent.delete({ where: { id: partnerId } });
    await db.contact.delete({ where: { phone_number: partnerPhone } });
    await db.agent.deleteMany({ where: { id: agentId } });
    await db.tenant.delete({ where: { id: tenantId } });
    await db.$disconnect();
    await prisma.$disconnect();
});

describe('real native session authority', () => {
    it('keeps independent devices hashed and preserves browser refresh', async () => {
        const one = await login(); const two = await login();
        expect(one.sessionId).not.toBe(two.sessionId);
        const stored = await db.mobileSession.findUniqueOrThrow({ where: { id: one.sessionId } });
        expect(stored.refresh_hash).toHaveLength(64);
        expect(stored.refresh_hash).not.toBe(one.refreshToken);
        expect((await db.agent.findUniqueOrThrow({ where: { id: agentId } })).refresh_token).toBe('browser-slot-untouched');
        expect((await access(one.token)).status).toBe(200);
        expect((await request(app).delete(`/auth/mobile/sessions/${one.sessionId}`).auth(two.token, { type: 'bearer' })).status).toBe(204);
        expect((await access(one.token)).status).toBe(401);
        expect((await access(two.token)).status).toBe(200);
    });
    it('rotates, restores, and revokes on signed refresh replay', async () => {
        const session = await login();
        const rotated = await request(app).post('/auth/mobile/refresh').send({ refreshToken: session.refreshToken });
        expect(rotated.status).toBe(200);
        expect(rotated.body.refreshToken).not.toBe(session.refreshToken);
        expect((await access(rotated.body.token)).status).toBe(200);
        expect((await request(app).post('/auth/mobile/refresh').send({ refreshToken: session.refreshToken })).status).toBe(401);
        expect((await access(rotated.body.token)).status).toBe(401);
    });
    it('enforces revocation before optional-identity routes, including mixed cookies and bearer case variants', async () => {
        const session = await login();
        await db.mobileSession.update({ where: { id: session.sessionId }, data: { revoked_at: new Date() } });
        const browser = jwt.sign({ id: agentId, tenant_id: tenantId, email: 'synthetic@example.invalid', role: 'employee' }, process.env.JWT_SECRET!);
        await request(app).post('/public/optional-identity').set('Authorization', `bearer ${session.token}`).set('Cookie', `rp_access_token=${browser}`).expect(401);
        await request(app).post('/public/optional-identity').set('Cookie', `rp_access_token=${session.token}`).expect(401);
        await request(app).post('/public/optional-identity').expect(200);
    });
    it('serializes concurrent rotation in PostgreSQL and fails closed on reuse', async () => {
        const session = await login();
        const results = await Promise.allSettled([refreshMobileSession(session.refreshToken), refreshMobileSession(session.refreshToken)]);
        expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
        expect((await access(session.token)).status).toBe(401);
    });
    it('rejects revoked and refresh credentials with trailing header data before the real optional-identity commit', async () => {
        const session = await login();
        await db.mobileSession.update({ where: { id: session.sessionId }, data: { revoked_at: new Date() } });
        for (const credential of [session.token, session.refreshToken]) {
            await request(app).post('/api/workflow/commit').set('Authorization', `Bearer ${credential} ignored`)
                .send({ answers: {}, source: 'admin' }).expect(401);
        }
        expect(commit).not.toHaveBeenCalled();
        const active = await login();
        await request(app).post('/api/workflow/commit').set('Authorization', `Bearer ${active.token} ignored`)
            .send({ answers: {}, source: 'admin' }).expect(401);
        expect(commit).not.toHaveBeenCalled();
        await request(app).post('/api/workflow/commit').auth(active.token, { type: 'bearer' })
            .send({ answers: {}, source: 'admin' }).expect(201);
        expect(commit).toHaveBeenLastCalledWith({ _source: 'admin' }, 'admin', agentId, undefined);
        const browser = request.agent(app);
        await browser.post('/auth/login').send({ phone, password: 'Synthetic-password-1' }).expect(200);
        const csrf = await browser.get('/auth/csrf').expect(200);
        await browser.post('/api/workflow/commit').set('X-CSRF-Token', csrf.body.csrf_token)
            .send({ answers: {}, source: 'admin' }).expect(201);
        expect(commit).toHaveBeenCalledTimes(2);
        await request(app).post('/api/workflow/commit').set('Cookie', 'rp_csrf=synthetic-public-csrf').set('X-CSRF-Token', 'synthetic-public-csrf')
            .send({ answers: {}, source: 'web' }).expect(201);
        expect(commit).toHaveBeenLastCalledWith({ _source: 'web' }, 'web', undefined, undefined);
    });
    it('rejects inactive accounts, changed permissions, tenant changes and expired sessions', async () => {
        const session = await login();
        await db.agent.update({ where: { id: agentId }, data: { status: 'inactive' } });
        expect((await access(session.token)).status).toBe(401);
        expect((await request(app).post('/auth/mobile/login').send({ phone, password: 'Synthetic-password-1', deviceName: 'Test' })).status).toBe(401);
        await db.agent.update({ where: { id: agentId }, data: { status: 'active', role: 'manager' } });
        expect((await access(session.token)).status).toBe(401);
        await db.agent.update({ where: { id: agentId }, data: { role: 'employee' } });
        await db.mobileSession.update({ where: { id: session.sessionId }, data: { tenant_id: 'other-tenant' } });
        expect((await access(session.token)).status).toBe(401);
        await db.mobileSession.update({ where: { id: session.sessionId }, data: { tenant_id: tenantId, expires_at: new Date(0) } });
        expect((await access(session.token)).status).toBe(401);
    });
    it('does not accept refresh, builder, or external portal tokens on staff routes', async () => {
        const session = await login();
        const service = new AuthService();
        expect(() => service.verifyToken(session.refreshToken)).toThrow();
        const builder = jwt.sign({ ownerId: 'synthetic-owner', scope: 'EXTERNAL' }, process.env.JWT_SECRET!);
        const portal = jwt.sign({ agent_id: agentId, role: 'EXTERNAL_AGENT' }, process.env.AGENT_JWT_SECRET!);
        expect((await access(builder)).status).toBe(401);
        expect((await access(portal)).status).toBe(401);
        const partner = jwt.sign({ id: partnerId, email: '', role: 'partner', tenant_id: tenantId }, process.env.JWT_SECRET!);
        expect((await request(app).get('/api/reports/private').auth(partner, { type: 'bearer' })).status).toBe(403);
    });
    it('preserves partner web identity while deriving its actual tenant and active status', async () => {
        const result = await new AuthService().loginPartnerByGoogleEmail('partner-mobile@example.invalid');
        expect(new AuthService().verifyToken(result.token).tenant_id).toBe(tenantId);
        const legacy = jwt.sign({ id: partnerId, email: '', role: 'partner', tenant_id: 'legacy-wrong-tenant' }, process.env.JWT_SECRET!);
        const me = await request(app).get('/auth/me').auth(legacy, { type: 'bearer' }).expect(200);
        expect(me.body.tenant_id).toBe(tenantId);
        await request(app).get('/api/reports/private').auth(legacy, { type: 'bearer' }).expect(403);
        await db.partnerAgent.update({ where: { id: partnerId }, data: { status: 'SUSPENDED' } });
        await request(app).get('/auth/me').auth(legacy, { type: 'bearer' }).expect(401);
        await db.partnerAgent.update({ where: { id: partnerId }, data: { status: 'ACTIVE' } });
    });
    it('enforces suspended tenant status on access, refresh and login', async () => {
        const session = await login();
        await db.tenant.update({ where: { id: tenantId }, data: { status: 'suspended' } });
        expect((await access(session.token)).status).toBe(401);
        expect((await request(app).post('/auth/mobile/refresh').send({ refreshToken: session.refreshToken })).status).toBe(401);
        expect((await request(app).post('/auth/mobile/login').send({ phone, password: 'Synthetic-password-1', deviceName: 'Synthetic' })).status).toBe(401);
    });
    it('retains cookie CSRF protection and keeps sessions scoped to their owner', async () => {
        const session = await login();
        expect((await request(app).delete(`/auth/mobile/sessions/${session.sessionId}`).set('Cookie', `rp_access_token=${session.token}`)).status).toBe(403);
        expect((await request(app).get('/auth/mobile/sessions').auth(session.token, { type: 'bearer' })).body[0]).not.toHaveProperty('refresh_hash');
        const stranger = jwt.sign({ id: 'stranger', tenant_id: tenantId, email: 'stranger@example.invalid', role: 'employee' }, process.env.JWT_SECRET!);
        await request(app).delete(`/auth/mobile/sessions/${session.sessionId}`).auth(stranger, { type: 'bearer' }).expect(204);
        expect((await access(session.token)).status).toBe(200);
    });
    it('preserves browser login, CSRF and logout without revoking another native device', async () => {
        const native = await login(), browser = request.agent(app);
        await browser.post('/auth/login').send({ phone, password: 'Synthetic-password-1' }).expect(200);
        await browser.get('/protected').expect(200);
        await browser.post('/auth/logout').send({}).expect(403);
        const csrf = await browser.get('/auth/csrf').expect(200);
        await browser.post('/auth/logout').set('X-CSRF-Token', csrf.body.csrf_token).send({}).expect(200);
        await browser.get('/protected').expect(401);
        expect((await access(native.token)).status).toBe(200);
    });
});
