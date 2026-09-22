import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// The route is POST /api/leads/... so the app-level double-submit CSRF gate would reject us.
// Same bypass the share-to-client guard test uses; auth is already a passthrough via setup.ts.
vi.mock('../middleware/csrf', () => ({
    csrfMiddleware: (_req: any, _res: any, next: any) => next(),
}));

// If the guard ever lets a duplicate through, these prove no partner welcome went out.
const { sendPartnerWelcomeWhatsApp } = vi.hoisted(() => ({
    sendPartnerWelcomeWhatsApp: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../services/partner_notifications', () => ({ sendPartnerWelcomeWhatsApp }));

const { ensurePartnerAgent } = vi.hoisted(() => ({
    ensurePartnerAgent: vi.fn().mockResolvedValue({ partnerId: 'p-new' }),
}));
vi.mock('../services/partner_auto_create', () => ({ ensurePartnerAgent }));

import app from '../app';
import prisma from '../db';

beforeEach(() => vi.clearAllMocks());

// Reported 2026-08-10: staff click "Convert to Partner Agent" by accident, and clicking it AGAIN
// re-runs the whole conversion — re-tagging deals and re-sending the customer a partner welcome.
//
// Root cause: the endpoint skipped re-conversion by checking contact_type === 'PARTNER_AGENT', but
// the 2026-07-28 `_keepDemand` guard in partner_auto_create.ts deliberately REFUSES to move a live
// BUYER/TENANT contact to that type (it was hiding real leads). So for exactly the leads that get
// converted by mistake, the guard never tripped.
//
// Proven on prod: +919555562204 (Vidit Tyagi, a HOT buyer) has one partner row but TWO
// `converted_to_partner` interactions, logged 09:12 on 4 Aug by two different agents.
describe('POST /api/leads/:phone/convert-to-partner — idempotency for live BUYER/TENANT leads', () => {
    it('no-ops when a PartnerAgent already exists, even though contact_type is still BUYER', async () => {
        (prisma.contact.findUnique as any).mockResolvedValue({
            phone_number: '+919555562204', name: 'Vidit Tyagi', tenant_id: 'default',
            contact_type: 'BUYER',            // _keepDemand kept it — the whole point of the bug
        });
        (prisma.partnerAgent.findUnique as any).mockResolvedValue({ id: 'p-existing' });

        const res = await request(app)
            .post('/api/leads/%2B919555562204/convert-to-partner')
            .send({ name: 'Vidit Tyagi', partner_category: 'INDIVIDUAL' });

        expect(res.status).toBe(200);
        expect(res.body.already_partner).toBe(true);
        expect(res.body.partner_id).toBe('p-existing');
        expect(res.body.reframed_deal_ids).toEqual([]);

        // The three things a repeat click must NOT do:
        expect(ensurePartnerAgent).not.toHaveBeenCalled();
        expect(sendPartnerWelcomeWhatsApp).not.toHaveBeenCalled();
        // The prod symptom was a DUPLICATE converted_to_partner log; assert none is written.
        // (setup.ts does not mock prisma.$transaction, so assert on the interaction instead.)
        expect(prisma.interaction.create).not.toHaveBeenCalled();
    });

    it('still no-ops for an already-typed PARTNER_AGENT contact (existing behaviour preserved)', async () => {
        (prisma.contact.findUnique as any).mockResolvedValue({
            phone_number: '+919000000001', name: 'Real Broker', tenant_id: 'default',
            contact_type: 'PARTNER_AGENT',
        });
        (prisma.partnerAgent.findUnique as any).mockResolvedValue({ id: 'p-broker' });

        const res = await request(app)
            .post('/api/leads/%2B919000000001/convert-to-partner')
            .send({ name: 'Real Broker' });

        expect(res.status).toBe(200);
        expect(res.body.already_partner).toBe(true);
        expect(sendPartnerWelcomeWhatsApp).not.toHaveBeenCalled();
    });

    it('404s an unknown lead without creating anything', async () => {
        (prisma.contact.findUnique as any).mockResolvedValue(null);
        const res = await request(app)
            .post('/api/leads/%2B919000000009/convert-to-partner')
            .send({ name: 'Nobody' });
        expect(res.status).toBe(404);
        expect(ensurePartnerAgent).not.toHaveBeenCalled();
    });
});
