import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import router from '../routes/omnidim';

const app = express();
app.use(express.json());
app.use('/webhooks/omnidim', router);
describe('unverified Omnidim provider gate', () => {
    it('rejects all provider events even if the sender supplies an invented signature', async () => {
        const result = await request(app).post('/webhooks/omnidim').set('x-omnidim-signature', 'synthetic-unverified').send({ event: 'call.completed', call_id: 'synthetic-call' });
        expect(result.status).toBe(503);
        expect(result.body.error).toContain('disabled');
    });
    it('reports contract and adapter disabled honestly', async () => {
        const result = await request(app).get('/webhooks/omnidim/health');
        expect(result.body).toMatchObject({ enabled: false, contract_verified: false });
    });
});
