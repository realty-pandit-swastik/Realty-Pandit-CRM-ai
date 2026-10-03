import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const ingestPushedLead = vi.fn();
vi.mock('../db', () => ({ default: { tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1' }) } } }));
vi.mock('../services/ninety_nine_acres_poller', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../services/ninety_nine_acres_poller')>();
    return { ...actual, NinetyNineAcresPoller: class { ingestPushedLead = ingestPushedLead; } };
});

import { parsePushedLead } from '../services/ninety_nine_acres_poller';
import router from '../integrations/99acres';

const app = express();
app.use(express.json());
app.use('/external/99acres', router);

const PAYLOAD = {
    QueryId: 'Q-1', RcvdOn: '2026-09-24 10:42:15', SubUserName: 'agent@example.com', PROPERTY_CODE: 'A123',
    ProdId: '987', ResCom: 'R', CityName: 'Gurgaon', ProjName: 'Sample Heights', Price: '9500000',
    Name: 'Buyer', Mobile: '+919800000000', Email: 'b@example.com',
    PhoneVerificationStatus: 'Verified', EmailVerificationStatus: 'Not Verified', IDENTITY: 'Individual',
};

beforeEach(() => {
    vi.clearAllMocks();
    process.env.EXTERNAL_API_KEYS = 'test-key';
    ingestPushedLead.mockResolvedValue('new');
});

describe('parsePushedLead', () => {
    it('maps the 99acres field names onto the pull-API lead shape', () => {
        expect(parsePushedLead(PAYLOAD)).toMatchObject({
            phone: '+919800000000', queryId: 'Q-1', subUserName: 'agent@example.com', propertyCode: 'A123',
            cityName: 'Gurgaon', projName: 'Sample Heights', price: '9500000', resCom: 'R', productId: '987',
            receivedOn: '2026-09-24 10:42:15', phoneVerificationStatus: 'Verified', identity: 'Individual',
        });
    });

    it('matches keys case-insensitively and ignores underscores; still accepts the old generic keys', () => {
        const lead = parsePushedLead({ query_id: 'Q-2', sub_user_name: 'a@b.com', property_code: 'P9', mobile: '9800000001', project_name: 'Old', city: 'Noida', requirement_type: 'buy', bedrooms: 3 });
        expect(lead).toMatchObject({ queryId: 'Q-2', subUserName: 'a@b.com', propertyCode: 'P9', phone: '9800000001', projName: 'Old', cityName: 'Noida' });
        expect(lead!.propertyLabel).toBe('buy 3 BHK');
    });

    it('returns null without a phone number', () => {
        expect(parsePushedLead({ QueryId: 'Q-3', Name: 'x' })).toBeNull();
    });
});

describe('POST /external/99acres/webhook', () => {
    it('rejects a missing or wrong API key', async () => {
        expect((await request(app).post('/external/99acres/webhook').send(PAYLOAD)).status).toBe(401);
        expect((await request(app).post('/external/99acres/webhook').set('X-API-Key', 'nope').send(PAYLOAD)).status).toBe(403);
        expect(ingestPushedLead).not.toHaveBeenCalled();
    });

    it('returns 400 without a mobile number and does not ingest', async () => {
        const res = await request(app).post('/external/99acres/webhook').set('X-API-Key', 'test-key').send({ QueryId: 'Q-4' });
        expect(res.status).toBe(400);
        expect(ingestPushedLead).not.toHaveBeenCalled();
    });

    it('hands the mapped lead to the shared ingest and returns 201', async () => {
        const res = await request(app).post('/external/99acres/webhook').set('X-API-Key', 'test-key').send(PAYLOAD);
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ success: true, status: 'new' });
        expect(ingestPushedLead).toHaveBeenCalledWith(expect.objectContaining({ queryId: 'Q-1', subUserName: 'agent@example.com' }), 'tenant-1');
    });

    it('returns 500 so 99acres retries when ingest fails', async () => {
        ingestPushedLead.mockRejectedValue(new Error('db down'));
        const res = await request(app).post('/external/99acres/webhook').set('X-API-Key', 'test-key').send(PAYLOAD);
        expect(res.status).toBe(500);
    });
});
