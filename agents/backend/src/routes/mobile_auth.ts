import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db';
import { authMiddleware } from '../middleware/auth';
import { loginLimiter } from '../middleware/rate_limit';
import { createMobileSession, refreshMobileSession } from '../services/mobile_session';

const router = Router();
const login = z.object({ phone: z.string().min(6).max(32), password: z.string().min(1).max(256), deviceName: z.string().trim().min(1).max(80) }).strict();
const refresh = z.object({ refreshToken: z.string().min(32).max(2048) }).strict();

router.post('/login', loginLimiter, async (req, res, next) => {
    const input = login.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: 'Phone, password and device name are required.' });
    try {
        const { phone, password, deviceName } = input.data;
        res.setHeader('Cache-Control', 'no-store');
        res.json(await createMobileSession(phone, password, deviceName));
    } catch (error) { next(error); }
});

router.post('/refresh', async (req, res, next) => {
    const input = refresh.safeParse(req.body);
    if (!input.success) return res.status(401).json({ error: 'Refresh credential required.' });
    try {
        res.setHeader('Cache-Control', 'no-store');
        res.json(await refreshMobileSession(input.data.refreshToken));
    } catch (error) { next(error); }
});

router.use(authMiddleware);
router.get('/sessions', async (req, res, next) => {
    try {
        res.setHeader('Cache-Control', 'no-store');
        res.json(await prisma.mobileSession.findMany({
            where: { agent_id: req.agent!.id, tenant_id: req.agent!.tenant_id, revoked_at: null, expires_at: { gt: new Date() } },
            select: { id: true, device_name: true, created_at: true, refreshed_at: true, expires_at: true },
            orderBy: { created_at: 'desc' },
        }));
    } catch (error) { next(error); }
});
router.delete('/sessions/:id', async (req, res, next) => {
    try {
        await prisma.mobileSession.updateMany({
            where: { id: String(req.params.id), agent_id: req.agent!.id, tenant_id: req.agent!.tenant_id },
            data: { revoked_at: new Date() },
        });
        res.status(204).end();
    } catch (error) { next(error); }
});

export default router;
