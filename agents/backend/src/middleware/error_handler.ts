import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import logger from '../utils/logger';
import { alertCritical } from '../utils/alerter';

export class AppError extends Error {
    public statusCode: number;
    public isOperational: boolean;

    constructor(message: string, statusCode: number) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

export class ValidationError extends AppError {
    constructor(message: string) { super(message, 400); }
}

export class AuthError extends AppError {
    constructor(message: string = 'Unauthorized') { super(message, 401); }
}

export class ForbiddenError extends AppError {
    constructor(message: string = 'Forbidden') { super(message, 403); }
}

export class NotFoundError extends AppError {
    constructor(message: string = 'Not found') { super(message, 404); }
}

/**
 * Global error handler - must be last middleware in app.
 */
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
    const requestId = (req as any).requestId || 'unknown';

    if (err instanceof AppError) {
        logger.warn('Operational error', {
            requestId,
            statusCode: err.statusCode,
            message: err.message,
            path: req.path,
            method: req.method,
        });

        res.status(err.statusCode).json({ error: err.message });
        return;
    }

    // Multer upload errors — return a clean 4xx to the client instead of a 500 + alert + GlitchTip noise.
    if (err instanceof multer.MulterError) {
        const map: Record<string, [number, string]> = {
            LIMIT_FILE_SIZE: [413, 'File too large.'],
            LIMIT_FILE_COUNT: [400, 'Too many files.'],
            LIMIT_UNEXPECTED_FILE: [400, `Unexpected file field${err.field ? `: ${err.field}` : ''}.`],
            LIMIT_PART_COUNT: [400, 'Too many parts in upload.'],
            LIMIT_FIELD_KEY: [400, 'Upload field name too long.'],
            LIMIT_FIELD_VALUE: [400, 'Upload field value too long.'],
            LIMIT_FIELD_COUNT: [400, 'Too many fields in upload.'],
        };
        const [status, message] = map[err.code] ?? [400, err.message];
        logger.warn('Multer upload error', {
            requestId,
            code: err.code,
            field: err.field,
            path: req.path,
            method: req.method,
        });
        res.status(status).json({ error: message });
        return;
    }

    // CORS error from our origin check
    if (err.message?.startsWith('CORS:')) {
        logger.warn('CORS rejection', { requestId, message: err.message, origin: req.headers.origin });
        res.status(403).json({ error: 'Not allowed by CORS' });
        return;
    }

    // Unexpected errors (5xx) — alert management
    logger.error('Unhandled error', {
        requestId,
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
    });

    // Send CRITICAL alert for 5xx errors (rate-limited per error message)
    alertCritical('server_5xx', `${req.method} ${req.path}: ${err.message}`, {
        requestId,
        path: req.path,
    });

    res.status(500).json({
        error: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message,
    });
}
