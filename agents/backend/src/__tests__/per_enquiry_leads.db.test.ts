// Real-database check of ONE CONTACT → MANY LEADS. Skipped unless REAL_DB_URL points at a THROWAWAY
// Postgres (never production):  REAL_DB_URL=postgresql://... npx vitest run src/__tests__/per_enquiry_leads.db.test.ts
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

const URL_ = process.env.REAL_DB_URL;
vi.unmock('../db');
vi.mock('../services/lead_qualification_caller', () => ({ scheduleQualificationCall: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../services/google_sync', () => ({ pushReminderToGoogle: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../services/shortage_book', () => ({ refreshDealShortage: vi.fn().mockResolvedValue(undefined) }));

describe.skipIf(!URL_)('per-enquiry leads on a real database', () => {
    const PHONE = '+919000099001';
    let prisma: any, ensureDealForLead: any;
    beforeAll(async () => {
        process.env.DATABASE_URL = URL_!;
        prisma = (await import('../db')).default;
        ({ ensureDealForLead } = await import('../services/ensure_deal'));
        await prisma.tenant.create({ data: { id: 'rt', business_name: 't', owner_name: 'o', primary_phone: '+910000000000' } });
        for (const id of ['A', 'B', 'C']) await prisma.agent.create({ data: { id: `rt-${id}`, tenant_id: 'rt', name: id, email: `${id}@rt.test` } });
        await prisma.contact.create({ data: { phone_number: PHONE, tenant_id: 'rt', name: 'Rahul', intent: 'buy', assigned_agent_id: 'rt-A' } });
    });
    afterAll(async () => {
        await prisma.task.deleteMany({ where: { contact_phone: PHONE } });
        await prisma.transaction.deleteMany({ where: { demand_contact_id: PHONE } });
        await prisma.contact.deleteMany({ where: { phone_number: PHONE } });
        await prisma.agent.deleteMany({ where: { tenant_id: 'rt' } });
        await prisma.tenant.delete({ where: { id: 'rt' } });
        await prisma.$disconnect();
    });

    const leads = () => prisma.transaction.findMany({ where: { demand_contact_id: PHONE }, orderBy: { created_at: 'asc' } });

    it('Test 1: 1 contact, 2 leads, each with its own assignee; lead #1 unchanged', async () => {
        const a = await ensureDealForLead({ contactPhone: PHONE, source: 'magicbricks', sourceRef: 'prop-A', assignedAgentId: 'rt-A' });
        const b = await ensureDealForLead({ contactPhone: PHONE, source: '99acres', sourceRef: 'prop-B', assignedAgentId: 'rt-B' });
        expect([a.created, b.created]).toEqual([true, true]);
        const rows = await leads();
        expect(rows.map((r: any) => [r.source, r.source_ref, r.coordinator_agent_id])).toEqual([
            ['magicbricks', 'prop-A', 'rt-A'], ['99acres', 'prop-B', 'rt-B'],
        ]);
        expect((await prisma.contact.findUnique({ where: { phone_number: PHONE } })).assigned_agent_id).toBe('rt-A');
    });

    it('Test 2: same source+property repeats are deduped; window=0 disables it', async () => {
        const dup = await ensureDealForLead({ contactPhone: PHONE, source: '99acres', sourceRef: 'prop-B', assignedAgentId: 'rt-B' });
        expect(dup.created).toBe(false);
        expect(await leads()).toHaveLength(2);
        process.env.DUPLICATE_ENQUIRY_WINDOW_DAYS = '0';
        const again = await ensureDealForLead({ contactPhone: PHONE, source: '99acres', sourceRef: 'prop-B', assignedAgentId: 'rt-B' });
        delete process.env.DUPLICATE_ENQUIRY_WINDOW_DAYS;
        expect(again.created).toBe(true);
        expect(await leads()).toHaveLength(3);
    });

    it('Test 4/5: visibility filter lets B see the contact via own lead, and not C', async () => {
        const { buildContactVisibilityFilter } = await import('../middleware/contact_visibility');
        const see = (id: string) => prisma.contact.count({ where: { phone_number: PHONE, ...buildContactVisibilityFilter(id, 'employee') } });
        expect(await see('rt-B')).toBe(1);
        expect(await see('rt-C')).toBe(0);
    });
});
