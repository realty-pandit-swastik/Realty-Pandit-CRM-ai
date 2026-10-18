import { afterAll, describe, expect, it, vi } from 'vitest';
import type { ErrorEvent, NodeOptions } from '@sentry/node';

const sentry = vi.hoisted(() => ({ init: vi.fn(), httpIntegration: vi.fn() }));
vi.mock('@sentry/node', () => sentry);

describe('actual telemetry beforeSend privacy boundary', () => {
    const originalDsn = process.env.GLITCHTIP_DSN;
    afterAll(() => {
        if (originalDsn === undefined) delete process.env.GLITCHTIP_DSN;
        else process.env.GLITCHTIP_DSN = originalDsn;
    });
    it('omits native auth bodies and case-insensitive credential headers, and scrubs camel/snake-case extras', async () => {
        process.env.GLITCHTIP_DSN = 'https://synthetic@example.invalid/1';
        await import('../instrument');
        const options = sentry.init.mock.calls[0][0] as NodeOptions;
        const beforeSend = options.beforeSend!;
        for (const data of [{ refreshToken: 'synthetic-private-value', password: 'synthetic-private-value' }, '{"refreshToken":"synthetic-private-value"}']) {
            const event: ErrorEvent = { type: undefined, request: { url: 'https://example.invalid/auth/mobile/refresh', data,
                headers: { Authorization: 'synthetic-private-value', COOKIE: 'synthetic-private-value', 'X-Csrf-Token': 'synthetic-private-value', 'X-API-KEY': 'synthetic-private-value', accept: 'application/json' } },
                extra: { refreshToken: 'synthetic-private-value', nested: { refresh_token: 'synthetic-private-value', accessToken: 'synthetic-private-value' } } };
            const result = await beforeSend(event, {});
            expect(result?.request?.data).toBeUndefined();
            expect(result?.request?.headers).toEqual({ accept: 'application/json' });
            expect(JSON.stringify(result).includes('synthetic-private-value')).toBe(false);
        }
        const result = await beforeSend({ type: undefined, request: { url: '/api/other', data: '{"token":"synthetic-private-value"}' } }, {});
        expect(result?.request?.data).toBeUndefined();
        const structured = await beforeSend({ type: undefined, request: { url: '/api/other', data: { refreshToken: 'synthetic-private-value', safe: 'retained' } } }, {});
        expect(structured?.request?.data).toEqual({ refreshToken: '[REDACTED]', safe: 'retained' });
    });
});
