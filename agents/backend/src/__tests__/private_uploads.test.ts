import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { blockPrivateUploads } from '../middleware/private_uploads';

const app = express();
app.use('/uploads', blockPrivateUploads, (_req, res) => res.sendStatus(200));
describe('private paperwork cannot bypass document authorization via static media', () => {
    it('blocks normal, encoded and normalized document paths', async () => {
        for (const path of ['/properties/synthetic/documents/deed.pdf', '/properties/synthetic/%64ocuments/deed.pdf', '/properties/synthetic/photos/..%2Fdocuments/deed.pdf']) {
            expect((await request(app).get(`/uploads${path}`)).status).toBe(404);
        }
    });
    it('keeps intentional listing photos and unrelated public assets available', async () => {
        expect((await request(app).get('/uploads/properties/synthetic/photo.jpg')).status).toBe(200);
        expect((await request(app).get('/uploads/projects/synthetic.jpg')).status).toBe(200);
    });
});
