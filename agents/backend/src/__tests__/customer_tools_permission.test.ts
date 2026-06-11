import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../services/whatsapp', () => ({
    WhatsAppService: class {
        sendText = vi.fn().mockResolvedValue({ messages: [{ id: 'wa123' }] });
        sendSingleProductMessage = vi.fn().mockResolvedValue(undefined);
        sendMultiProductMessage = vi.fn().mockResolvedValue(undefined);
        sendFlow = vi.fn().mockResolvedValue(undefined);
        sendTemplate = vi.fn().mockResolvedValue(undefined);
    },
}));

// resolveTypeFilter resolves a slug → taxonomy node; mock it so we can assert how the search
// uses the result (as a UNION, not a hard AND).
vi.mock('../utils/demand_taxonomy', () => ({
    resolveTypeFilter: vi.fn().mockResolvedValue({ sub_category_id: 'sub-flat-1' }),
    resolveDemandTaxonomy: vi.fn().mockResolvedValue({ needs_review: false }),
}));

// Prevent real Meta catalog calls in the awaited upsert path; keep other exports intact.
vi.mock('../services/catalog_sync', async (orig: any) => ({
    ...(await orig()),
    upsertCatalogProduct: vi.fn().mockResolvedValue(null),
}));

import app from '../app';
import prisma from '../db';

beforeEach(() => vi.clearAllMocks());

// A "customer" caller is NOT in the agents table → resolveCaller returns null.
describe('customer tools — non-agent (guest) callers', () => {
    beforeEach(() => {
        (prisma.agent.findFirst as any).mockResolvedValue(null); // not an agent
    });

    it('lets a guest reach /search-and-show-properties (past permission, not 403)', async () => {
        (prisma.inventory.findMany as any).mockResolvedValue([]); // 0 results → early return, no WhatsApp send
        const res = await request(app)
            .post('/webhooks/internal/tools/search-and-show-properties')
            .send({ caller: '+919000000000', city: 'Vaishali' });
        expect(res.status).not.toBe(403);
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    it('lets a guest reach /send-booking-flow (past permission → 400 for missing property_id, not 403)', async () => {
        const res = await request(app)
            .post('/webhooks/internal/tools/send-booking-flow')
            .send({ caller: '+919000000000' }); // no property_id
        expect(res.status).not.toBe(403);
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/property_id/i);
    });

    it('builds a UNION (OR) type filter — taxonomy node OR legacy type text — so un-tagged listings are NOT dropped', async () => {
        const findMany = (prisma.inventory.findMany as any).mockResolvedValue([]);
        await request(app)
            .post('/webhooks/internal/tools/search-and-show-properties')
            .send({ caller: '+919000000000', city: 'Vaishali', property_type: 'flat' });
        const whereArg = findMany.mock.calls.at(-1)?.[0]?.where;
        // The taxonomy id and the legacy contains-match are BOTH OR branches (union, ≥ legacy reach)…
        expect(whereArg.OR).toEqual(expect.arrayContaining([
            { sub_category_id: 'sub-flat-1' },
            { type: { contains: 'flat', mode: 'insensitive' } },
        ]));
        // …and the taxonomy id is NOT a top-level AND, which would silently drop un-tagged inventory.
        expect(whereArg.sub_category_id).toBeUndefined();
    });

    it('STILL 403s a guest on a team-only tool (/my-leads)', async () => {
        const res = await request(app)
            .get('/webhooks/internal/tools/my-leads?caller=%2B919000000000');
        expect(res.status).toBe(403);
    });

    it('STILL 403s a guest on another team tool (/search-inventory)', async () => {
        const res = await request(app)
            .get('/webhooks/internal/tools/search-inventory?caller=%2B919000000000&location=Vaishali&intent=rent');
        expect(res.status).toBe(403);
    });
});

// Soft-BHK search quality: ~95% of rental specs have NO bedroom field (verified in prod: 43/45).
// A HARD BHK match dropped every BHK-unknown listing → 0 results → the bot sent nothing. BHK must
// be SOFT: keep exact matches + BHK-unknown listings, exclude only a KNOWN different BHK.
describe('customer search — soft BHK filter (data gap guard)', () => {
    beforeEach(() => { (prisma.agent.findFirst as any).mockResolvedValue(null); }); // guest

    it('keeps exact-BHK + BHK-unknown listings, excludes a known different BHK', async () => {
        (prisma.inventory.findMany as any).mockResolvedValue([
            { id: 'p-unknown', apartment_name: 'A', city: 'Ghaziabad', type: 'apartment', display_price: 20000, specs: { area: 950 } },
            { id: 'p-2bhk',    apartment_name: 'B', city: 'Ghaziabad', type: 'apartment', display_price: 22000, specs: { bhk: 2 } },
            { id: 'p-3bhk',    apartment_name: 'C', city: 'Ghaziabad', type: 'apartment', display_price: 30000, specs: { bedrooms: 3 } },
        ]);
        const res = await request(app)
            .post('/webhooks/internal/tools/search-and-show-properties')
            .send({ caller: '+919000000000', city: 'Ghaziabad', intent: 'RENT', property_type: 'flat', bhk: 2 });
        expect(res.status).toBe(200);
        // 2BHK kept + unknown kept, 3BHK excluded → 2
        expect(res.body.count).toBe(2);
    });

    it('does NOT drop a listing just because its BHK is unrecorded (regression guard for the 0-results bug)', async () => {
        (prisma.inventory.findMany as any).mockResolvedValue([
            { id: 'p-x', apartment_name: 'X', city: 'Ghaziabad', type: 'apartment', display_price: 16000, specs: { area: 950 } },
        ]);
        const res = await request(app)
            .post('/webhooks/internal/tools/search-and-show-properties')
            .send({ caller: '+919000000000', city: 'Ghaziabad', bhk: 2 });
        expect(res.body.count).toBe(1); // the old hard filter returned 0 here
    });
});

// An agent still passes everywhere (no regression).
describe('customer tools — agent callers unchanged', () => {
    const agent = {
        id: 'a1', name: 'Rohan', phone: '+919958860411', email: 'r@x.com',
        role: 'employee', department: null, gender: 'male',
        preferred_language: 'hi_en', tenant_id: 't1', status: 'active',
    };
    beforeEach(() => { (prisma.agent.findFirst as any).mockResolvedValue(agent); });

    it('agent reaches /search-and-show-properties', async () => {
        (prisma.inventory.findMany as any).mockResolvedValue([]);
        const res = await request(app)
            .post('/webhooks/internal/tools/search-and-show-properties')
            .send({ caller: '+919958860411', city: 'Vaishali' });
        expect(res.status).toBe(200);
    });
});
