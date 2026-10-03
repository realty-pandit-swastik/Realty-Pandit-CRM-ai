import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../db';
import { assertPortalUrl, discoverListingUrls, parseListing, robotsAllows } from '../crawlers/portal_adapters';
import { crawlTarget, runDailyPortalSourcing } from '../crawlers/portal_crawler';
const target = { tenant_id: 't1', source: 'magicbricks' as const, area: 'Noida', url: 'https://www.magicbricks.com/property-for-sale/residential-real-estate?cityName=Noida', pilot_approved: true };
const listingUrl = 'https://www.magicbricks.com/propertyDetails/3-BHK-Apartment-for-Sale-in-Noida&id=123';
const html = (value: any) => `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
const listing = html({ '@type': 'Apartment', identifier: 'mb-123', name: '3 BHK Apartment', numberOfBedrooms: 3, address: { addressLocality: 'Noida', streetAddress: 'Sector 75' }, image: ['https://public.example/image.jpg'], offers: { price: '12500000', priceCurrency: 'INR', seller: { '@type': 'Person', name: 'Public Seller', telephone: '9876543210' } } });
beforeEach(() => {
    vi.clearAllMocks();
    process.env.PORTAL_CRAWLER_ENABLED = 'true'; process.env.PORTAL_SOURCE_MAGICBRICKS_ENABLED = 'true';
    process.env.PORTAL_INGESTION_TOKEN = 'fixture-token-'.repeat(4); process.env.PORTAL_INGESTION_TENANT_ID = 't1'; process.env.PORTAL_INGESTION_URL = 'http://localhost/api/inventory/harvest/service';
    (prisma as any).portalCrawlRun = { create: vi.fn().mockResolvedValue({ id: 'run' }), update: vi.fn().mockResolvedValue({}) };
});
describe('public portal adapters', () => {
    it.each(['99acres', 'magicbricks', 'housing'] as const)('parses %s public structured listings', source => {
        const urls = { '99acres': 'https://www.99acres.com/3-bhk-property-in-noida-npspid-123', magicbricks: listingUrl, housing: 'https://housing.com/in/buy/resale/page/123-apartment-in-noida' };
        expect(parseListing(source, listing, urls[source])).toMatchObject({ source, source_ref: 'mb-123', city: 'Noida', price: 12500000, specs: { bhk: 3 }, seller_phone: '9876543210' });
    });
    it('never invents private phone details or harvests organization/support telephone', () => {
        const value = JSON.parse(listing.match(/>(.*)<\/script>/)![1]); value.offers.seller = { '@type': 'Organization', name: 'Portal Support', telephone: '9876543210' };
        expect(parseListing('magicbricks', html(value), listingUrl).seller_phone).toBeUndefined();
        delete value.offers.seller; expect(parseListing('magicbricks', html(value), listingUrl).seller_phone).toBeUndefined();
        expect(() => parseListing('magicbricks', '<html>No public details</html>', listingUrl)).toThrow('structured data');
    });
    it('discovers only approved portal listing links and rejects SSRF/credentials/private redirects', () => {
        expect(discoverListingUrls('magicbricks', `<a href="${listingUrl}">Listing</a><a href="https://localhost/propertyDetails/1">Bad</a>`, target.url)).toEqual([listingUrl]);
        for (const raw of ['http://www.magicbricks.com/propertyDetails/1', 'https://www.magicbricks.com.evil.test/propertyDetails/1', 'https://127.0.0.1/propertyDetails/1', 'https://user:pass@www.magicbricks.com/propertyDetails/1', 'https://www.magicbricks.com/login']) expect(() => assertPortalUrl('magicbricks', raw)).toThrow();
    });
    it('honours robots groups, wildcard/end patterns, longest rule, and Allow ties', () => {
        const robots = 'User-agent: *\nDisallow: /property*\nAllow: /propertyDetails/public\nDisallow: /*?private=*$\nUser-agent: RealtyPanditSourcing\nDisallow: /\nAllow: /propertyDetails/public';
        expect(robotsAllows(robots, new URL(listingUrl))).toBe(false);
        expect(robotsAllows(robots, new URL('https://www.magicbricks.com/propertyDetails/public-123'))).toBe(true);
        expect(robotsAllows('User-agent: *\nDisallow: /private\nAllow: /private', new URL('https://housing.com/private'))).toBe(true);
        expect(robotsAllows('User-agent: *\nDisallow: /*?private=*$', new URL('https://housing.com/a?private=1'))).toBe(false);
    });
});
describe('crawler failure/progress gates', () => {
    const transport = () => ({ get: vi.fn().mockResolvedValueOnce({ data: 'User-agent: *\nAllow: /\nCrawl-delay: 8' }).mockResolvedValueOnce({ data: `<a href="${listingUrl}">listing</a>` }).mockResolvedValueOnce({ data: listing }), post: vi.fn().mockResolvedValue({ data: { success: true, candidate_id: 'c', status: 'CANDIDATE', duplicate: false } }) });
    it('is disabled without both source switch and supervised pilot gate', async () => {
        const client = transport(); process.env.PORTAL_SOURCE_MAGICBRICKS_ENABLED = 'false';
        expect(await crawlTarget(target, client as any)).toEqual({ disabled: true });
        process.env.PORTAL_SOURCE_MAGICBRICKS_ENABLED = 'true'; expect(await crawlTarget({ ...target, pilot_approved: false }, client as any)).toEqual({ disabled: true });
        expect(client.get).not.toHaveBeenCalled(); expect((prisma as any).portalCrawlRun.create).not.toHaveBeenCalled();
    });
    it('tracks acknowledged candidates and freshness, rate limits and forbids redirects', async () => {
        const client = transport(); const pause = vi.fn().mockResolvedValue(undefined);
        expect(await crawlTarget(target, client as any, pause)).toMatchObject({ ingested: 1, candidates: 1 });
        expect(pause.mock.calls[1][0]).toBeGreaterThan(7900);
        expect(client.get.mock.calls[0][1]).toMatchObject({ maxRedirects: 0 });
        expect((prisma as any).portalCrawlRun.update).toHaveBeenLastCalledWith({ where: { id: 'run' }, data: { status: 'SUCCEEDED', finished_at: expect.any(Date) } });
    });
    it('never advances progress after failed ingestion and strips token/config error payloads', async () => {
        const client = transport(); client.post.mockRejectedValue({ isAxiosError: true, config: { headers: { Authorization: 'Bearer SECRET' } }, response: { status: 503, data: 'private seller details' } });
        await expect(crawlTarget(target, client as any, async () => {})).rejects.toThrow('HTTP/transport failure (503)');
        const writes = (prisma as any).portalCrawlRun.update.mock.calls;
        expect(writes).toHaveLength(1); expect(writes[0][0].data.status).toBe('FAILED'); expect(JSON.stringify(writes)).not.toMatch(/SECRET|private seller/);
    });
    it('does not request robots-disallowed targets or foreign tenant targets', async () => {
        const client = transport(); client.get.mockReset().mockResolvedValue({ data: 'User-agent: *\nDisallow: /' });
        await expect(crawlTarget(target, client as any, async () => {})).rejects.toThrow('robots'); expect(client.get).toHaveBeenCalledTimes(1);
        await expect(crawlTarget({ ...target, tenant_id: 'foreign' }, client as any)).rejects.toThrow('tenant');
    });
    it('requires configured tenant even before shortage target lookup', async () => {
        delete process.env.PORTAL_INGESTION_TENANT_ID;
        await expect(runDailyPortalSourcing([target])).rejects.toThrow('tenant scope'); expect(prisma.shortageEntry.findMany).not.toHaveBeenCalled();
    });
});
