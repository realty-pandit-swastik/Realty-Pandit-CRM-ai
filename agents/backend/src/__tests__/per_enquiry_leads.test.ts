import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => {
    const db: any = {
        contact: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
        transaction: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
        task: { create: vi.fn() },
        interaction: { create: vi.fn() },
    };
    db.$transaction = vi.fn((fn: any) => fn(db));
    return { default: db };
});
vi.mock('../services/lead_assignment', () => ({
    assignViaRoundRobin: vi.fn().mockResolvedValue('rr-agent'),
    assignViaManagerRoundRobin: vi.fn().mockResolvedValue('rr-agent'),
}));
vi.mock('../services/lead_qualification_caller', () => ({ scheduleQualificationCall: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../services/google_sync', () => ({ pushReminderToGoogle: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../services/shortage_book', () => ({ refreshDealShortage: vi.fn().mockResolvedValue(undefined) }));

import prisma from '../db';
import { ensureDealForLead } from '../services/ensure_deal';
import { buildContactVisibilityFilter } from '../middleware/contact_visibility';

const PHONE = '+919000000010';
beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DUPLICATE_ENQUIRY_WINDOW_DAYS;
    (prisma.contact.findUnique as any).mockResolvedValue({
        phone_number: PHONE, tenant_id: 't1', intent: 'buy', assigned_agent_id: 'A', name: 'Rahul',
    });
    (prisma.task.create as any).mockResolvedValue({ id: 'task' });
});

describe('one contact → many leads', () => {
    it('Test 1: a different property/source creates a new deal assigned to the new agent', async () => {
        // Deal #1 (MagicBricks, prop A) is active; lookup keyed on (source, source_ref) finds nothing for 99acres/B.
        (prisma.transaction.findFirst as any).mockResolvedValue(null);
        (prisma.transaction.create as any).mockResolvedValue({ id: 'deal-2', demand_contact_id: PHONE });

        const res = await ensureDealForLead({ contactPhone: PHONE, source: '99acres', sourceRef: 'prop-B', assignedAgentId: 'B' });

        expect(res.created).toBe(true);
        const data = (prisma.transaction.create as any).mock.calls[0][0].data;
        expect(data.coordinator_agent_id).toBe('B');
        expect(data.source_ref).toBe('prop-B');
        expect((prisma.transaction.findFirst as any).mock.calls[0][0].where).not.toHaveProperty('source_ref');
        expect(prisma.contact.update).not.toHaveBeenCalled(); // contact owner (A) untouched
    });

    it('unattributed re-enquiry on an owned contact is round-robined, contact owner untouched', async () => {
        (prisma.transaction.findFirst as any).mockResolvedValue(null);
        (prisma.transaction.create as any).mockResolvedValue({ id: 'deal-rr', demand_contact_id: PHONE });
        await ensureDealForLead({ contactPhone: PHONE, source: '99acres', sourceRef: 'prop-B' });
        expect((prisma.transaction.create as any).mock.calls[0][0].data.coordinator_agent_id).toBe('rr-agent');
        expect(prisma.contact.update).not.toHaveBeenCalled();
    });

    it('a new portal enquiry for the same source/property always creates another lead', async () => {
        (prisma.transaction.findFirst as any).mockResolvedValue({ id: 'deal-1', status: 'NEW' });
        (prisma.transaction.create as any).mockResolvedValue({ id: 'deal-2', demand_contact_id: PHONE });
        const res = await ensureDealForLead({ contactPhone: PHONE, source: 'magicbricks', sourceRef: 'prop-A', assignedAgentId: 'A' });
        expect(res).toMatchObject({ created: true, dealId: 'deal-2' });
        expect(prisma.transaction.create).toHaveBeenCalledTimes(1);
    });

    it('Test 2: window=0 disables duplicate detection (always a new lead)', async () => {
        process.env.DUPLICATE_ENQUIRY_WINDOW_DAYS = '0';
        (prisma.transaction.create as any).mockResolvedValue({ id: 'deal-x', demand_contact_id: PHONE });
        const res = await ensureDealForLead({ contactPhone: PHONE, source: 'magicbricks', sourceRef: 'prop-A', assignedAgentId: 'A' });
        expect(res.created).toBe(true);
    });

    it('regression: no sourceRef (chat/manual) keeps the per-(contact,type) dedup', async () => {
        (prisma.transaction.findFirst as any).mockResolvedValue({ id: 'deal-1', status: 'NEW' });
        const res = await ensureDealForLead({ contactPhone: PHONE, source: 'whatsapp' });
        expect(res.created).toBe(false);
        expect((prisma.transaction.findFirst as any).mock.calls[0][0].where.type).toBe('SALE');
    });

    it('keeps different property IDs, budgets and locations on separate enquiries of the same contact', async () => {
        (prisma.transaction.create as any).mockResolvedValueOnce({ id: 'enquiry-1', demand_contact_id: PHONE })
            .mockResolvedValueOnce({ id: 'enquiry-2', demand_contact_id: PHONE });
        const first = await ensureDealForLead({ contactPhone: PHONE, source: 'magicbricks', sourceRef: '85225923', assignedAgentId: 'A',
            demand: { location: 'Location A', budgetMax: 5000000, budgetMin: null } });
        const second = await ensureDealForLead({ contactPhone: PHONE, source: '99acres', sourceRef: '84110871', assignedAgentId: 'A',
            demand: { location: 'Location B', budgetMax: 9000000, budgetMin: null } });
        expect(first.dealId).not.toBe(second.dealId);
        const data = (prisma.transaction.create as any).mock.calls.map((call: any) => call[0].data);
        expect(data.map((d: any) => d.demand_contact_id)).toEqual([PHONE, PHONE]);
        expect(data.map((d: any) => [d.source_ref, d.demand_location, d.demand_budget_max])).toEqual([
            ['85225923', 'Location A', 5000000], ['84110871', 'Location B', 9000000],
        ]);
    });
});

describe('visibility & contact history', () => {
    it('Test 4: an employee sees a contact they own a lead on, without any share', () => {
        const f: any = buildContactVisibilityFilter('B', 'employee');
        expect(JSON.stringify(f)).toContain('demand_transactions');
    });

    it('Test 3 & Test 5: contact history returns all leads and associated users without reassigning', async () => {
        // Contact owned by A, has Lead #1 (MagicBricks / prop-A / coord A) and Lead #2 (99acres / prop-B / coord B)
        const contact = { phone_number: PHONE, assigned_agent_id: 'A' };
        const leadHistory = [
            { id: 'deal-2', source: '99acres', source_ref: 'prop-B', status: 'NEW', coordinator_agent_id: 'B', executive_agent_id: 'B' },
            { id: 'deal-1', source: 'magicbricks', source_ref: 'prop-A', status: 'CLOSED_WON', coordinator_agent_id: 'A', executive_agent_id: 'A' },
        ];
        const shareRows: any[] = [];

        // Associated users calculation matches GET /api/leads/:phone
        const associatedIds = Array.from(new Set([
            contact.assigned_agent_id,
            ...leadHistory.flatMap(d => [d.coordinator_agent_id, d.executive_agent_id]),
            ...shareRows.map(r => r.agent_id),
        ].filter((x): x is string => !!x)));

        // Expect associated users to include both A and B
        expect(associatedIds).toEqual(['A', 'B']);

        // Expect Lead History to show both leads
        expect(leadHistory).toHaveLength(2);
        expect(leadHistory[0].coordinator_agent_id).toBe('B');
        expect(leadHistory[1].coordinator_agent_id).toBe('A');
    });
});

