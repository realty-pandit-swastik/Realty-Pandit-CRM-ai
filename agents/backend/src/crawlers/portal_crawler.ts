import axios from 'axios';
import prisma from '../db';
import { PortalSource, assertPortalUrl, discoverListingUrls, parseListing, robotsAllows } from './portal_adapters';

export interface CrawlTarget { tenant_id: string; source: PortalSource; area: string; url: string; pilot_approved: boolean }
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export function sourceEnabled(source: PortalSource) {
    return process.env.PORTAL_CRAWLER_ENABLED === 'true' && process.env[`PORTAL_SOURCE_${source.toUpperCase()}_ENABLED`] === 'true';
}
export async function crawlTarget(target: CrawlTarget, transport = axios, pause: (ms: number) => Promise<unknown> = sleep) {
    if (!sourceEnabled(target.source) || target.pilot_approved !== true) return { disabled: true };
    if (target.tenant_id !== process.env.PORTAL_INGESTION_TENANT_ID) throw new Error('Crawler target tenant differs from ingestion scope');
    const token = process.env.PORTAL_INGESTION_TOKEN;
    if (!token || token.length < 32) throw new Error('Ingestion token not configured');
    const endpoint = new URL(process.env.PORTAL_INGESTION_URL || '');
    if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname))) throw new Error('Ingestion requires HTTPS');
    if (endpoint.username || endpoint.password || endpoint.pathname !== '/api/inventory/harvest/service') throw new Error('Invalid narrow ingestion endpoint');
    const search = assertPortalUrl(target.source, target.url);
    const run = await prisma.portalCrawlRun.create({ data: { tenant_id: target.tenant_id, source: target.source, area: target.area, target_url: search.href } });
    let ingested = 0, duplicates = 0, candidates = 0, lastRequest = 0;
    let delay = Math.max(5000, Number(process.env.PORTAL_CRAWL_DELAY_MS) || 5000);
    const request = async (url: URL) => {
        if (!sourceEnabled(target.source)) throw new Error('Source kill switch disabled during run');
        await pause(Math.max(0, lastRequest + delay - Date.now())); lastRequest = Date.now();
        const response = await transport.get<string>(url.href, { maxRedirects: 0, timeout: 20000, maxContentLength: 2 * 1024 * 1024, headers: { 'User-Agent': 'RealtyPanditSourcing/1.0', Accept: 'text/html,text/plain' }, responseType: 'text' });
        if (typeof response.data !== 'string') throw new Error('Unsupported public response');
        return response.data;
    };
    try {
        const robots = await request(new URL('/robots.txt', search));
        // Honour advertised delays conservatively even if they belong to a more specific bot group.
        for (const match of robots.matchAll(/^\s*crawl-delay\s*:\s*(\d+(?:\.\d+)?)\s*$/gim)) delay = Math.max(delay, Number(match[1]) * 1000);
        if (!robotsAllows(robots, search)) throw new Error('Target disallowed by robots.txt');
        const html = await request(search);
        if (/captcha challenge|verify you are human|access denied|sign in to continue/i.test(html)) throw new Error('Public access challenge; source halted');
        const urls = discoverListingUrls(target.source, html, search.href);
        if (!urls.length) throw new Error('No public listing links; supervised adapter review required');
        const limit = Math.min(20, Math.max(1, Number(process.env.PORTAL_CRAWL_MAX_LISTINGS) || 5));
        for (const raw of urls.slice(0, limit)) {
            const url = assertPortalUrl(target.source, raw);
            if (!robotsAllows(robots, url)) throw new Error('Listing disallowed by robots.txt');
            const body = await request(url);
            if (/captcha challenge|verify you are human|access denied|sign in to continue/i.test(body)) throw new Error('Public access challenge; source halted');
            const payload = parseListing(target.source, body, url.href);
            const response = await transport.post(endpoint.href, payload, { timeout: 30000, maxRedirects: 0, headers: { Authorization: `Bearer ${token}` } });
            if (!response.data?.success || !response.data.candidate_id) throw new Error('Ingestion was not acknowledged');
            if (response.data.duplicate) duplicates++; else ingested++;
            if (response.data.status === 'CANDIDATE') candidates++;
            // Record progress only AFTER acknowledgement. Failure leaves status FAILED, never success.
            await prisma.portalCrawlRun.update({ where: { id: run.id }, data: { ingested_count: ingested, duplicate_count: duplicates, candidate_count: candidates } });
        }
        await prisma.portalCrawlRun.update({ where: { id: run.id }, data: { status: 'SUCCEEDED', finished_at: new Date() } });
        return { run_id: run.id, ingested, duplicates, candidates };
    } catch (error) {
        // Do not persist axios config/headers, response bodies, tokens or seller PII.
        const failure = axios.isAxiosError(error) ? `HTTP/transport failure${error.response?.status ? ` (${error.response.status})` : ''}; retry listing ingestion` : error instanceof Error ? error.message.slice(0, 300) : 'Crawler failed';
        await prisma.portalCrawlRun.update({ where: { id: run.id }, data: { status: 'FAILED', failure, finished_at: new Date() } });
        throw new Error(failure);
    }
}

/** Config maps operator-reviewed public URLs to open shortage areas. No guessed portal search URLs. */
export async function runDailyPortalSourcing(targets: CrawlTarget[]) {
    if (process.env.PORTAL_CRAWLER_ENABLED !== 'true') return;
    const tenantId = process.env.PORTAL_INGESTION_TENANT_ID;
    if (!tenantId) throw new Error('Crawler tenant scope is required');
    const open = await prisma.shortageEntry.findMany({ where: { status: 'OPEN', tenant_id: tenantId }, select: { tenant_id: true, area: true } });
    const needed = new Set(open.filter(s => s.area).map(s => `${s.tenant_id}:${s.area!.trim().toLowerCase()}`));
    const failures: string[] = [];
    for (const target of targets) {
        if (!needed.has(`${target.tenant_id}:${target.area.trim().toLowerCase()}`)) continue;
        try { await crawlTarget(target); } catch { failures.push(`${target.source}:${target.area}`); }
    }
    if (failures.length) throw new Error(`Portal sourcing failed for ${failures.length} target(s); inspect portal_crawl_runs`);
}
