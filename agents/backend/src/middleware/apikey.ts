
import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/**
 * API Key authentication middleware for external integrations.
 * Validates X-API-Key header against stored keys.
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
        return res.status(401).json({ error: 'Missing X-API-Key header' });
    }

    const validKeys = (process.env.EXTERNAL_API_KEYS || '').split(',').filter(Boolean);

    if (validKeys.length === 0) {
        logger.warn('[ApiKeyAuth] No EXTERNAL_API_KEYS configured in environment');
        return res.status(500).json({ error: 'API key authentication not configured' });
    }

    if (!validKeys.includes(apiKey)) {
        return res.status(403).json({ error: 'Invalid API key' });
    }

    next();
}
