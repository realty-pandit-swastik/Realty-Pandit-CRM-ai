import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../db';
import logger from '../utils/logger';

// Local Prisma mock: the shared setup does not model portalListing/inventory rows,
// which the listing-owner attribution fallback reads.
vi.mock('../db', () => ({
    default: {
        $queryRaw: vi.fn().mockResolvedValue([]),
        $transaction: vi.fn(),
        contact: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
        transaction: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
        interaction: { create: vi.fn(), count: vi.fn() },
        agent: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
        partnerAgent: { findUnique: vi.fn(), findMany: vi.fn() },
        inventory: { findUnique: vi.fn(), findMany: vi.fn() },
        portalListing: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
        tenant: { findFirst: vi.fn() },
    },
}));

// ensureDealForLead is the seam under test: control created true/false + failure.
const dealMock = vi.hoisted(() => ({ ensureDealForLead: vi.fn() }));
vi.mock('../services/ensure_deal', () => dealMock);
// Notifications are asserted, never sent.
const notifyMock = vi.hoisted(() => ({ notify: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../services/notify', () => notifyMock);

import { handlePortalReenquiry } from '../services/portal_reenquiry';
import { notify } from '../services/notify';

const PHONE = '+919000000031';

beforeEach(() => {
    vi.clearAllMocks();
    dealMock.ensureDealForLead.mockResolvedValue({ dealId: 'deal-new', created: true, status: 'NEW' });
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({ phone_number: PHONE, tenant_id: 't1', lead_cycle: 1 } as any);
    vi.mocked(prisma.contact.update).mockResolvedValue({} as any);
    vi.mocked(prisma.portalListing.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.inventory.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.agent.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.agent.findUnique).mockResolvedValue({ id: 'agent-1', name: 'Owner', phone: null, email: null } as any);
    vi.mocked(prisma.interaction.create).mockResolvedValue({} as any);
});

const base = {
    phone: PHONE, source: '99acres', sourceRef: 'S94715572',
    subUser: 'owner@example.com', tenantId: 't1', contactName: 'QA Buyer',
};

describe('handlePortalReenquiry', () => {
    it('routes an explicitly-attributed enquiry to that agent and notifies them', async () => {
        const r = await handlePortalReenquiry({ ...base, attributedAgentId: 'agent-1' });

        expect(r).toMatchObject({ dealId: 'deal-new', created: true, attributedAgentId: 'agent-1', attributionMethod: 'sub_user' });
        expect(dealMock.ensureDealForLead).toHaveBeenCalledWith(expect.objectContaining({
            contactPhone: PHONE, source: '99acres', sourceRef: 'S94715572', assignedAgentId: 'agent-1',
        }));
        // Cycle stamped so the row visibly renews.
        expect(prisma.contact.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { phone_number: PHONE },
            data: expect.objectContaining({ lead_cycle: 2 }),
        }));
        const stamp = vi.mocked(prisma.contact.update).mock.calls[0][0].data as any;
        expect(stamp.recycled_at).toBeInstanceOf(Date);
        expect(stamp.cycle_start_at).toBeInstanceOf(Date);
        // Listing owner learns about the fresh enquiry on their listing.
        expect(notify).toHaveBeenCalledWith('lead_assigned', expect.anything(), expect.objectContaining({ deal_id: 'deal-new' }));
    });

    it('falls back to the harvested listing owner when the sub-user is unmapped', async () => {
        vi.mocked(prisma.portalListing.findFirst).mockResolvedValue({ inventory_id: 'inv-1' } as any);
        vi.mocked(prisma.inventory.findUnique).mockResolvedValue({ assigned_agent_id: 'agent-1' } as any);
        vi.mocked(prisma.agent.findFirst).mockResolvedValue({ id: 'agent-1', name: 'Owner' } as any);

        const r = await handlePortalReenquiry({ ...base, attributedAgentId: null });

        expect(r).toMatchObject({ attributedAgentId: 'agent-1', attributionMethod: 'listing_owner' });
        expect(dealMock.ensureDealForLead).toHaveBeenCalledWith(
            expect.objectContaining({ assignedAgentId: 'agent-1' }));
        expect(notify).toHaveBeenCalledWith('lead_assigned', expect.anything(), expect.anything());
    });

    it('is loud — never silent — when an enquiry cannot be attributed to anyone', async () => {
        const r = await handlePortalReenquiry({ ...base, attributedAgentId: null, sourceRef: null, subUser: null });

        expect(r.attributedAgentId).toBeNull();
        expect(r.attributionMethod).toBe('unattributed');
        expect(dealMock.ensureDealForLead).toHaveBeenCalledWith(
            expect.objectContaining({ assignedAgentId: undefined }));
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('unattributable'));
        // Nobody to notify, so no notification — but the attempt is on the record.
        expect(notify).not.toHaveBeenCalled();
    });

    it('on a dedupe hit refreshes the cycle, names the attached deal, and notifies — without reassigning', async () => {
        dealMock.ensureDealForLead.mockResolvedValue({ dealId: 'deal-old', created: false, status: 'NEW' });

        const r = await handlePortalReenquiry({ ...base, attributedAgentId: 'agent-1' });

        expect(r).toMatchObject({ dealId: 'deal-old', created: false });
        // Date visibly renews even though no duplicate deal is spawned.
        expect(prisma.contact.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ lead_cycle: 2 }),
        }));
        // The re-engagement names the attached deal so the row visibly changes.
        expect(prisma.interaction.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                event_type: 'lead_reengaged',
                metadata: expect.objectContaining({ deal_id: 'deal-old' }),
            }),
        }));
        expect(notify).toHaveBeenCalledWith('lead_reengaged', expect.anything(), expect.objectContaining({ deal_id: 'deal-old' }));
    });

    it('lets a deal failure propagate instead of swallowing it', async () => {
        dealMock.ensureDealForLead.mockRejectedValue(new Error('db exploded'));
        await expect(handlePortalReenquiry({ ...base, attributedAgentId: 'agent-1' })).rejects.toThrow('db exploded');
    });
});