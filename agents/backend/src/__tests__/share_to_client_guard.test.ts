import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// If the guard ever lets a bad phone through, this mock lets us prove no WhatsApp send happened.
// vi.hoisted so the spies exist when the (hoisted) vi.mock factory runs.
const { sendText, sendImage } = vi.hoisted(() => ({
    sendText: vi.fn().mockResolvedValue(undefined),
    sendImage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../services/whatsapp', () => ({
    WhatsAppService: class {
        sendText = sendText;
        sendImage = sendImage;
    },
}));

// Bypass the double-submit CSRF gate (app-level) so we can POST the route directly; auth is already
// a passthrough via the global test setup. Our guard returns 400 before req.agent is touched.
vi.mock('../middleware/csrf', () => ({
    csrfMiddleware: (_req: any, _res: any, next: any) => next(),
}));

import app from '../app';
import prisma from '../db';

beforeEach(() => vi.clearAllMocks());

// Regression for the reported bug: sharing inventory with a partner-referral lead pushed the lead's
// PENDING- placeholder contact key into WhatsApp as a phone (digit-stripped to "83830443903016494").
// POST /api/inventory/:id/share-to-client must reject placeholder / un-normalizable phones with 400
// BEFORE it upserts a contact or fires any WhatsApp send.
describe('POST /api/inventory/:id/share-to-client — placeholder/junk phone guard', () => {
    it('rejects a PENDING- placeholder key with 400 and sends nothing', async () => {
        const res = await request(app)
            .post('/api/inventory/inv-1/share-to-client')
            .send({ client_phone: 'PENDING-8383044390-mpyh3p016494', client_name: 'Rahul' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/no valid client phone/i);
        expect(sendText).not.toHaveBeenCalled();
        expect(sendImage).not.toHaveBeenCalled();
        expect(prisma.contact.upsert).not.toHaveBeenCalled();
    });

    it('rejects a TEMP_ legacy placeholder with 400', async () => {
        const res = await request(app)
            .post('/api/inventory/inv-1/share-to-client')
            .send({ client_phone: 'TEMP_998877', client_name: 'X' });
        expect(res.status).toBe(400);
        expect(prisma.contact.upsert).not.toHaveBeenCalled();
    });

    it('rejects an un-normalizable junk value (a name) with 400', async () => {
        const res = await request(app)
            .post('/api/inventory/inv-1/share-to-client')
            .send({ client_phone: 'ChiragWadhwa' });
        expect(res.status).toBe(400);
        expect(sendText).not.toHaveBeenCalled();
        expect(prisma.contact.upsert).not.toHaveBeenCalled();
    });

    it('still 400s when client_phone is missing entirely (unchanged behavior)', async () => {
        const res = await request(app)
            .post('/api/inventory/inv-1/share-to-client')
            .send({ client_name: 'No phone' });
        expect(res.status).toBe(400);
        // The route also accepts deal_id in place of a phone (redaction-safe share), so the
        // message names both.
        expect(res.body.error).toMatch(/client_phone.*required/i);
    });
});
