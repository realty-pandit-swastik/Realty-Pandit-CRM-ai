/**
 * Helper to report a caught error to GlitchTip while still letting the route
 * return a controlled response.
 *
 * Use in routes that handle their own errors (try/catch + manual res.status)
 * and don't bubble to setupExpressErrorHandler. Example:
 *
 *   try {
 *     await doWork();
 *   } catch (err) {
 *     captureRouteError(err, req, { workflowId, step: 'commit' });
 *     return res.status(500).json({ error: 'Could not save workflow' });
 *   }
 *
 * For routes that already throw / call next(err), prefer that path — the
 * Express error handler reports automatically with full request context.
 */

import type { Request } from 'express';
import * as SentrySDK from '@sentry/node';
import logger from './logger';
import { AppError } from '../middleware/error_handler';

export function captureRouteError(
    err: unknown,
    req: Request,
    context: Record<string, any> = {},
): void {
    const error = err instanceof Error ? err : new Error(String(err));

    // Business-rule rejections (validation/auth/not-found, i.e. 4xx AppError) are
    // expected user-input outcomes, not server faults. Log them but DON'T push to
    // GlitchTip — otherwise the digest floods with non-actionable noise (e.g. the
    // "own number" owner guard → #105/#16, invalid stage transition → #97). Mirrors
    // captureBackgroundError's benign-skip. (2026-06-25)
    if (err instanceof AppError && err.statusCode < 500) {
        logger.warn('Route validation rejection (not captured)', {
            path: req.path,
            method: req.method,
            statusCode: err.statusCode,
            ...context,
            error: error.message,
        });
        return;
    }

    logger.error('Route error', {
        path: req.path,
        method: req.method,
        ...context,
        error: error.message,
    });

    SentrySDK.captureException(error, {
        tags: {
            route: (req as any).route?.path ?? req.path,
            method: req.method,
        },
        extra: context,
    });
}

/**
 * Report a caught error from a non-route context (background task, scheduled job,
 * service-layer code). Use when you want explicit GlitchTip reporting without
 * a Request object.
 */
export function captureBackgroundError(
    err: unknown,
    context: { source: string; [key: string]: any },
): void {
    const error = err instanceof Error ? err : new Error(String(err));

    // Benign Google OAuth-scope errors (member connected sign-in but lacks Calendar/Tasks scope)
    // are handled at the source (google_sync wipes + nudges reconnect); don't clutter GlitchTip.
    if (/insufficientPermissions|permission_denied|insufficient permission|insufficient authentication scopes/i.test(error.message)) {
        logger.warn(`Benign OAuth-scope error skipped (${context.source}): ${error.message}`);
        return;
    }

    logger.error(`Background error (${context.source})`, {
        ...context,
        error: error.message,
    });

    SentrySDK.captureException(error, {
        tags: { source: context.source },
        extra: context,
    });
}
