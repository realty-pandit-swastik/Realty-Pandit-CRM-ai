import { timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import prisma from '../db';

/** One narrowly scoped ingestion token; tenant/staff/source scope comes only from server config. */
export async function portalIngestionAuth(req: Request, res: Response, next: NextFunction) {
    const secret = process.env.PORTAL_INGESTION_TOKEN;
    const tenantId = process.env.PORTAL_INGESTION_TENANT_ID;
    const staffId = process.env.PORTAL_INGESTION_AGENT_ID;
    if (!secret || secret.length < 32 || !tenantId || !staffId) return res.status(503).json({ error: 'Portal ingestion is disabled' });
    const supplied = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
    const expected = Buffer.from(secret); const actual = Buffer.from(supplied);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return res.status(401).json({ error: 'Unauthorized' });
    const sources = (process.env.PORTAL_INGESTION_SOURCES || '').split(',').map(s => s.trim());
    if (!sources.includes(req.body?.source)) return res.status(403).json({ error: 'Source is not permitted' });
    try {
        const agent = await prisma.agent.findFirst({ where: { id: staffId, tenant_id: tenantId, status: 'active', role: { in: ['super_boss', 'manager', 'employee'] } } });
        if (!agent) return res.status(403).json({ error: 'Assigned ingestion staff is unavailable' });
        req.agent = agent;
        return next();
    } catch { return res.status(503).json({ error: 'Ingestion authorization unavailable' }); }
}
