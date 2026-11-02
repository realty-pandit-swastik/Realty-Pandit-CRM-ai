import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import builder from '../routes/builder';
import { cacheGet } from '../utils/redis';

const app = express(); app.use(express.json()); app.use('/builder', builder);
describe('builder login cannot use an absent/demo OTP', () => {
    it('rejects a missing stored OTP', async () => {
        vi.mocked(cacheGet).mockResolvedValueOnce(null);
        const result = await request(app).post('/builder/verify-otp').send({ phone: '+919000000099', otp: '1234' });
        expect(result.status).toBe(400); expect(result.body).not.toHaveProperty('token');
    });
    it('fails closed when OTP storage fails', async () => {
        vi.mocked(cacheGet).mockRejectedValueOnce(new Error('Synthetic Redis failure'));
        const result = await request(app).post('/builder/verify-otp').send({ phone: '+919000000099', otp: '1234' });
        expect(result.status).toBe(500); expect(result.body).not.toHaveProperty('token');
    });
});
