import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../app';

describe('App Security', () => {
    it('returns security headers from helmet', async () => {
        const res = await request(app).get('/');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-frame-options']).toBeDefined();
    });

    it('attaches request ID header', async () => {
        const res = await request(app).get('/');
        expect(res.headers['x-request-id']).toBeDefined();
        expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('health check returns ok', async () => {
        const prisma = (await import('../db')).default;
        (prisma.$queryRaw as any).mockResolvedValueOnce([{ '?column?': 1 }]);

        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
    });

    it('root route returns running message', async () => {
        const res = await request(app).get('/');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Backend API is running');
    });
});

describe('Rate Limiting', () => {
    it('returns rate limit headers on auth routes', async () => {
        const res = await request(app).post('/auth/login').send({ email: 'test@test.com', password: 'bad' });
        expect(res.headers['ratelimit-limit']).toBeDefined();
    });
});

describe('Input Validation', () => {
    it('rejects login with missing fields', async () => {
        const res = await request(app).post('/auth/login').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Validation failed');
        expect(res.body.details).toBeDefined();
    });

    it('rejects login with invalid email', async () => {
        const res = await request(app).post('/auth/login').send({ email: 'bad', password: 'pass' });
        expect(res.status).toBe(400);
        expect(res.body.details.some((d: string) => d.includes('email'))).toBe(true);
    });

    it('rejects newsletter with invalid email', async () => {
        const res = await request(app).post('/public/newsletter').send({ email: 'not-email' });
        expect(res.status).toBe(400);
    });

    it('rejects contact form with missing name', async () => {
        const res = await request(app).post('/public/contact').send({ phone: '+919876543210' });
        expect(res.status).toBe(400);
    });

    it('rejects post-property with missing required fields', async () => {
        const res = await request(app).post('/public/post-property').send({ intent: 'sell' });
        expect(res.status).toBe(400);
    });
});
