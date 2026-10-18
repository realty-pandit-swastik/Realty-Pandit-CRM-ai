import { expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import logger from '../utils/logger';
import { requestLogger } from '../middleware/request_logger';

it('logs the route template without identifiers, queries or credentials', async () => {
    vi.mocked(logger.info).mockClear();
    const app = express(); app.use(requestLogger);
    app.get('/contacts/:phone', (_req, res) => res.sendStatus(200));
    await request(app).get('/contacts/synthetic-private-key?token=synthetic-capability');
    expect(logger.info).toHaveBeenCalledWith('Request completed', expect.objectContaining({ path: '/contacts/:phone' }));
    const output = JSON.stringify(vi.mocked(logger.info).mock.calls);
    expect(output).not.toContain('synthetic-private-key'); expect(output).not.toContain('synthetic-capability');
});
