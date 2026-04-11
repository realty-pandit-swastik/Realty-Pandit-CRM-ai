import { Request, Response, NextFunction } from 'express';
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
