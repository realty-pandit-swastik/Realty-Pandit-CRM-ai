import { Request, Response, NextFunction } from 'express';
import { cacheGet, cacheSet } from '../utils/redis';

/**
 * Cache middleware factory.
 * Caches GET responses in Redis with configurable TTL.
 */
export function cache(ttlSeconds: number, keyGenerator?: (req: Request) => string) {
    return async (req: Request, res: Response, next: NextFunction) => {
        if (req.method !== 'GET') {
            next();
            return;
        }

        const key = keyGenerator
            ? `cache:${keyGenerator(req)}`
            : `cache:${req.originalUrl}`;

        try {
            const cached = await cacheGet(key);
            if (cached) {
                res.setHeader('X-Cache', 'HIT');
                res.json(JSON.parse(cached));
                return;
            }
        } catch {
            // Cache miss or error - continue to handler
        }

        // Override res.json to cache the response
        const originalJson = res.json.bind(res);
        res.json = ((body: any) => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                cacheSet(key, JSON.stringify(body), ttlSeconds).catch(() => {});
            }
            res.setHeader('X-Cache', 'MISS');
            return originalJson(body);
        }) as any;

        next();
    };
}
