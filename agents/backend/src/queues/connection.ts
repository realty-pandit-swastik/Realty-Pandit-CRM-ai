/**
 * BullMQ Redis Connection — Shared config for all queues and workers.
 *
 * BullMQ requires `maxRetriesPerRequest: null` on the Redis connection.
 * Reuses the same REDIS_HOST / REDIS_PORT / REDIS_PASSWORD env vars as the cache layer.
 */

import { ConnectionOptions } from 'bullmq';

export const redisConnection: ConnectionOptions = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null, // Required by BullMQ
};
