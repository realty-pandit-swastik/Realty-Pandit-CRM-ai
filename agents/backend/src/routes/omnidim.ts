/** Provider contract has not been verified; do not accept unauthenticated business events. */
import { Router } from 'express';
const router = Router();
router.post('/', (_req, res) => res.status(503).json({
    error: 'Omnidim CRM ingestion is disabled pending verified callback authentication and account onboarding',
}));
router.get('/health', (_req, res) => res.json({ ok: true, provider: 'omnidim', enabled: false, contract_verified: false }));
export default router;
