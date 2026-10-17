import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { listActivities, mutateActivity, type ActivityKind, type ActivityGroup } from '../services/activity_feed';
import { CrmError } from '../services/contact_relationship';
import { captureRouteError } from '../utils/capture';

const router = Router();
router.use(authMiddleware);
router.get('/', async (req, res) => {
    try {
        const group = String(req.query.group || 'today');
        const page = Number(req.query.page || 1);
        const type = String(req.query.type || '');
        const contact = String(req.query.contact || '');
        if (!['overdue', 'today', 'upcoming', 'done'].includes(group) || !Number.isInteger(page) || page < 1 || page > 10000
            || !['', 'call', 'followup', 'matching', 'visit', 'whatsapp', 'other'].includes(type) || contact.length > 150) {
            return res.status(400).json({ error: 'Invalid activity filter' });
        }
        res.json(await listActivities(req.agent!, { group: group as ActivityGroup, page, type, contact }));
    } catch (error) {
        captureRouteError(error, req, { route: 'activities-list' });
        res.status(error instanceof CrmError ? error.status : 500).json({ error: error instanceof CrmError ? error.message : 'Could not load activities. Please retry.' });
    }
});
router.patch('/:kind/:id', async (req, res) => {
    try {
        if (!['task', 'followup', 'appointment', 'visit', 'contact'].includes(String(req.params.kind))
            || !['complete', 'reschedule'].includes(req.body?.action) || String(req.params.id).length > 150) {
            return res.status(400).json({ error: 'Invalid activity action' });
        }
        res.json(await mutateActivity(req.agent!, String(req.params.kind) as ActivityKind, String(req.params.id), req.body.action, req.body.scheduled_at));
    } catch (error) {
        captureRouteError(error, req, { route: 'activities-update' });
        res.status(error instanceof CrmError ? error.status : 500).json({ error: error instanceof CrmError ? error.message : 'Could not update activity. Please retry.' });
    }
});
export default router;
