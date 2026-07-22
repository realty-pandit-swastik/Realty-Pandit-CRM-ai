import { describe, it, expect, vi, beforeEach } from 'vitest';

// Spy on the Sentry transport. capture.ts calls `SentrySDK.captureException`.
const captureExceptionMock = vi.fn();
vi.mock('@sentry/node', () => ({
    captureException: (...args: any[]) => captureExceptionMock(...args),
}));

import { captureRouteError } from '../utils/capture';
import { AppError, ValidationError, NotFoundError } from '../middleware/error_handler';

const fakeReq = { path: '/api/test', method: 'POST' } as any;

beforeEach(() => vi.clearAllMocks());

// GlitchTip #105/#16/#97: business-rule rejections (4xx AppError) were flooding the
// error tracker as if they were server faults. captureRouteError must skip them.
describe('captureRouteError — 4xx business-rule skip', () => {
    it('does NOT capture a ValidationError (400) to GlitchTip', () => {
        captureRouteError(new ValidationError('You cannot use your own number…'), fakeReq, { route: 'workflow#8' });
        expect(captureExceptionMock).not.toHaveBeenCalled();
    });

    it('does NOT capture a NotFoundError (404)', () => {
        captureRouteError(new NotFoundError('deal not found'), fakeReq);
        expect(captureExceptionMock).not.toHaveBeenCalled();
    });

    it('DOES capture a 5xx AppError', () => {
        captureRouteError(new AppError('db exploded', 500), fakeReq);
        expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    });

    it('DOES capture a plain unexpected Error', () => {
        captureRouteError(new Error('unexpected'), fakeReq);
        expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    });
});
