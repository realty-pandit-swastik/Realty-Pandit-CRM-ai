import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware, requireRole } from '../middleware/auth';
import { createHandoff, claimHandoff, handoffFile, cancelHandoff, HandoffError } from '../services/personal_whatsapp_handoff';
const router = Router();
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
const staff = [authMiddleware, requireRole('super_boss', 'manager', 'employee')];
const prepareLimit = rateLimit({ windowMs: 10 * 60 * 1000, limit: 6, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many preparation attempts. Please wait and retry.' } });
const helperLimit = rateLimit({ windowMs: 60_000, limit: 200, standardHeaders: 'draft-7', legacyHeaders: false });
function bearer(req: any) { return req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1] || ''; }
function errorResponse(res: any, error: unknown) { res.status(error instanceof HandoffError ? error.status : 500).json({ error: error instanceof HandoffError ? error.message : 'Could not prepare My WhatsApp share. Please retry.' }); }
router.post('/', ...staff, prepareLimit, async (req, res) => {
    try { res.json(await createHandoff(req.agent!, req.body)); } catch (error) { errorResponse(res, error); }
});
router.post('/claim', helperLimit, async (req, res) => {
    try { res.json(await claimHandoff(bearer(req))); } catch (error) { errorResponse(res, error); }
});
router.get('/files/:fileId', helperLimit, async (req, res) => {
    try { const file = await handoffFile(bearer(req), String(req.params.fileId));
        res.setHeader('Cache-Control', 'no-store, no-transform');
        res.setHeader('Content-Type', file.mime); res.setHeader('Content-Length', file.size); res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
        res.sendFile(file.path, error => { if (error && !res.headersSent) res.status(410).json({ error: 'Attachment unavailable. Prepare again.' }); });
    } catch (error) { errorResponse(res, error); }
});
router.post('/cancel', ...staff, async (req, res) => {
    try { await cancelHandoff(req.agent!, String(req.body?.launch_token || '')); res.json({ cancelled: true }); } catch (error) { errorResponse(res, error); }
});
export default router;
