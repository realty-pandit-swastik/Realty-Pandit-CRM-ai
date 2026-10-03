import 'dotenv/config';
import { readFileSync } from 'fs';
import cron from 'node-cron';
import prisma from '../db';
import logger from '../utils/logger';
import { runDailyPortalSourcing, CrawlTarget } from './portal_crawler';

async function run() {
    if (process.env.PORTAL_CRAWLER_ENABLED !== 'true') return;
    const file = process.env.PORTAL_CRAWL_TARGETS_FILE;
    if (!file) throw new Error('PORTAL_CRAWL_TARGETS_FILE required');
    const targets: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(targets) || targets.some(t => !t || !['99acres', 'magicbricks', 'housing'].includes(t.source) || typeof t.area !== 'string' || typeof t.tenant_id !== 'string' || typeof t.url !== 'string' || typeof t.pilot_approved !== 'boolean')) throw new Error('Invalid reviewed crawl targets');
    await runDailyPortalSourcing(targets as CrawlTarget[]);
}
let busy = false;
async function tick() {
    if (busy) return;
    busy = true;
    try { await run(); } catch { logger.error('[PortalCrawler] Run failed; inspect portal_crawl_runs and reviewed configuration'); process.exitCode = 1; }
    finally { busy = false; }
}
if (process.argv.includes('--once')) tick().finally(() => prisma.$disconnect());
else {
    // Separate process, a single instance. Does not belong to API/BullMQ/enquiry poller startup.
    cron.schedule('0 7 * * *', tick, { timezone: 'Asia/Kolkata' });
    const stop = async () => { await prisma.$disconnect(); process.exit(0); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
