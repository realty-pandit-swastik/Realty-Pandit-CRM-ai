import { Router } from 'express';
import { checkPermission } from '../middleware/auth';
import { CallingError, listCallingWork, controlCallingWork } from '../services/calling_work';
const router = Router();
router.use(checkPermission('act_on_deals'));
function failure(res: any, err: any) {
    if (err instanceof CallingError) return res.status(err.status).json({ error: err.message });
    if (err.code === 'P2034') return res.status(409).json({ error: 'Calling work changed concurrently; refresh and try again' });
    return res.status(500).json({ error: 'Calling work could not be updated' });
}
router.get('/', async (req: any, res) => {
    if (req.query.queue && !['fresh', 'aged'].includes(req.query.queue)) return res.status(400).json({ error: 'Invalid queue' });
    const limit = Number(req.query.limit || 25);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (req.query.cursor && typeof req.query.cursor !== 'string')) return res.status(400).json({ error: 'Invalid pagination' });
    try { res.json({ success: true, data: await listCallingWork(req.agent, req.query.queue || 'fresh', req.query.cursor, limit) }); }
    catch (err) { failure(res, err); }
});
router.post('/:id/:action', async (req: any, res) => {
    try { const work = await controlCallingWork(req.agent, req.params.id, req.params.action, req.body?.disposition); res.json({ success: true, data: work, provider_available: false }); }
    catch (err) { failure(res, err); }
});
export default router;
