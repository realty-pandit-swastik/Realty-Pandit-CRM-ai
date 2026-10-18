import { Router } from 'express';
import { authMiddleware, checkPermission } from '../middleware/auth';
import { contactRelationship, CrmError } from '../services/contact_relationship';
import { dispatchContactMatches, dispatchLeadMatches } from '../services/match_dispatch';
import { captureRouteError } from '../utils/capture';

const router = Router();
router.use(authMiddleware);
router.get('/contacts/:phone/relationship', async (req, res) => {
    try {
        const page = Number(req.query.page || 1);
        if (!Number.isInteger(page) || page < 1 || page > 10000) return res.status(400).json({ error: 'Invalid page' });
        res.json(await contactRelationship(String(req.params.phone), req.agent!, page));
    } catch (error) {
        captureRouteError(error, req, { route: 'contact-relationship' });
        res.status(error instanceof CrmError ? error.status : 500).json({ error: error instanceof CrmError ? error.message : 'Could not load contact relationship' });
    }
});
router.post('/enquiries/:id/send-matches', checkPermission('act_on_deals'), async (req, res) => {
    try {
        res.json(await dispatchLeadMatches(req.agent!, String(req.params.id), req.body?.request_id));
    } catch (error) {
        captureRouteError(error, req, { route: 'enquiry-send-matches' });
        res.status(error instanceof CrmError ? error.status : 500).json({ error: error instanceof CrmError ? error.message : 'Matching could not be sent. Please retry.' });
    }
});
router.post('/contacts/:phone/send-matches', checkPermission('act_on_deals'), async (req, res) => {
    try {
        res.json(await dispatchContactMatches(req.agent!, String(req.params.phone), req.body?.request_id));
    } catch (error) {
        captureRouteError(error, req, { route: 'contact-send-matches' });
        res.status(error instanceof CrmError ? error.status : 500).json({ error: error instanceof CrmError ? error.message : 'Matching could not be sent. Please retry.' });
    }
});
export default router;
