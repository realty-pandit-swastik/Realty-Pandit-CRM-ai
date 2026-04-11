import Redis from 'ioredis';
import logger from './logger';

let redis: Redis | null = null;

function getRedis(): Redis | null {
    if (redis) return redis;

    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379');
    const password = process.env.REDIS_PASSWORD || undefined;

    try {
        redis = new Redis({
            host,
            port,
            password,
            maxRetriesPerRequest: 3,
            retryStrategy: (times) => {
                if (times > 3) {
                    logger.warn('Redis connection failed, running without cache');
                    return null; // Stop retrying
                }
                return Math.min(times * 200, 2000);
            },
            lazyConnect: true,
        });

        redis.on('connect', () => logger.info('Redis connected'));
        redis.on('error', (err) => {
            logger.warn('Redis error', { error: err.message });
            // Do NOT null out redis here — ioredis retryStrategy handles reconnection.
            // Nulling would permanently disable cache even for transient errors.
        });
        redis.on('end', () => {
            // Only null out when retryStrategy gives up (returns null) and connection is truly dead
            logger.warn('Redis connection ended, running without cache');
            redis = null;
        });

        redis.connect().catch(() => {
            logger.warn('Redis unavailable, running without cache');
            // Don't null here either — retryStrategy may still reconnect
        });

        return redis;
    } catch {
        logger.warn('Redis initialization failed, running without cache');
        return null;
    }
}

export async function cacheGet(key: string): Promise<string | null> {
    const client = getRedis();
    if (!client) return null;
    try {
        return await client.get(key);
    } catch {
        return null;
    }
}

export async function cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
    const client = getRedis();
    if (!client) return;
    try {
        await client.setex(key, ttlSeconds, value);
    } catch {
        // Silently fail - cache is optional
    }
}

export async function cacheDel(pattern: string): Promise<void> {
    const client = getRedis();
    if (!client) return;
    try {
        const keys = await client.keys(pattern);
        if (keys.length > 0) {
            await client.del(...keys);
        }
    } catch {
        // Silently fail
    }
}

export default { get: cacheGet, set: cacheSet, del: cacheDel };
