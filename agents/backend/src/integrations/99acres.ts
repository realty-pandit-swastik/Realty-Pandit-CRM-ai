import { Router } from 'express';
import prisma from '../db';
import { apiKeyAuth } from '../middleware/apikey';
import logger from '../utils/logger';
import { normalizePhone } from '../utils/phone';
import { NinetyNineAcresPoller, parsePushedLead } from '../services/ninety_nine_acres_poller';

const router = Router();
router.use(apiKeyAuth);

/**
 * 99acres PUSH lead webhook.
 *
 * Maps the pushed JSON onto the same ParsedLead the pull API produces and runs the pull poller's
 * ingest, so both feeds behave identically: de-duplication by QueryId, routing to the team member
 * named in SubUserName (manager review when unmatched), per-enquiry deals keyed on PROPERTY_CODE,
 * buyer confirmation, and the escalation check. See parsePushedLead for the accepted field names.
 */
router.post('/webhook', async (req, res) => {
    const lead = parsePushedLead(req.body);
    const phoneNumber = lead ? normalizePhone(lead.phone) : null;
    if (!lead || !phoneNumber) {
        return res.status(400).json({ error: 'Mobile is required' });
    }
    logger.info(`[99acres] Incoming push lead: query=${lead.queryId ?? '-'} property=${lead.propertyCode ?? '-'} subUser=${lead.subUserName ?? '-'}`);

    try {
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return res.status(500).json({ error: 'System not configured' });

        const status = await new NinetyNineAcresPoller().ingestPushedLead(lead, tenant.id);
        logger.info(`[99acres] Push lead ${status}: ${phoneNumber}`);
        res.status(201).json({ success: true, contact_id: phoneNumber, status });
    } catch (error) {
        logger.error('[99acres] Push ingest error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

export default router;
