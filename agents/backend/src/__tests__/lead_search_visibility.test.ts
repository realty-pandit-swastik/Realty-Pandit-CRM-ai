import { describe, it, expect, vi } from 'vitest';

const db = vi.hoisted(() => ({
    contact: { findMany: vi.fn(async () => []) },
    partnerAgent: { findMany: vi.fn(async () => []) },
}));
vi.mock('../db', () => ({ default: db }));
vi.mock('../middleware/auth', () => ({
    authMiddleware: (req: any, _res: any, next: any) => { req.agent = { id: 'staff-1', role: 'employee' }; next(); },
    checkPermission: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../services/lead_score', () => ({ LeadScoreService: class {} }));
vi.mock('../services/matching_engine', () => ({ MatchingEngine: class {} }));

import leads from '../routes/leads';

describe('lead search visibility', () => {
    it('restricts both contacts and partner suggestions for staff', async () => {
        const search = (leads as any).stack.find((layer: any) => layer.route?.path === '/search').route.stack[0].handle;
        const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
        await search({ query: { q: 'Shiv' }, agent: { id: 'staff-1', role: 'employee' } }, res);
        expect(res.json).toHaveBeenCalledWith([]);
        expect(db.contact.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ AND: [
                expect.objectContaining({ OR: expect.arrayContaining([{ assigned_agent_id: 'staff-1' }]) }),
                expect.objectContaining({ OR: [{ name: { contains: 'Shiv', mode: 'insensitive' } }] }),
            ] }),
        }));
        expect(db.partnerAgent.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ managing_agent_id: 'staff-1' }),
        }));
    });
});
