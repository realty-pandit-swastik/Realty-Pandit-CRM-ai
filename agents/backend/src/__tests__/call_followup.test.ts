import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
    contact: { findUnique: vi.fn() },
    transaction: { updateMany: vi.fn() },
    task: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 't' }) },
}));
vi.mock('../db', () => ({ default: db }));
vi.mock('../services/call_demand', () => ({ approvedCallFields: vi.fn().mockResolvedValue({ intent: 'buy', budget_max: 6000000, demand_taxonomy_node_id: 'flat', demand_schema_values: { bhk: '2' } }) }));
vi.mock('../services/ensure_deal', () => ({ ensureDealForLead: vi.fn() }));
vi.mock('../services/shortage_book', () => ({ refreshDealShortage: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../services/property_sharing', () => ({ shareNextPropertyDetailed: vi.fn() }));
vi.mock('../services/transcription', () => ({ default: {} }));
vi.mock('../services/call_extractor', () => ({ default: {} }));

import { ensureDealForLead } from '../services/ensure_deal';
import { refreshDealShortage } from '../services/shortage_book';
import { shareNextPropertyDetailed } from '../services/property_sharing';
import { applyApprovedCall } from '../services/call_followup';

const CALL = { id: 'call-1', phone_number: '+919800000001' };
const BUY = { intent: 'BUY', location: 'Sector 62', budgetMin: 40, budgetMax: 60, summary: 'wants 2bhk' };

beforeEach(() => {
    vi.clearAllMocks();
    db.task.create.mockResolvedValue({ id: 't' });
    db.contact.findUnique.mockResolvedValue({ assigned_agent_id: null });
    (ensureDealForLead as any).mockResolvedValue({ dealId: 'deal-1', created: true, status: 'QUALIFIED' });
    (shareNextPropertyDetailed as any).mockResolvedValue({ status: 'exhausted_notified' });
});

describe('applyApprovedCall', () => {
    it('creates a QUALIFIED deal for a buy call, converting lakhs to rupees, assigned to the reviewer when the caller has no owner', async () => {
        const r = await applyApprovedCall(CALL, BUY, 'agent-1', false);
        expect(ensureDealForLead).toHaveBeenCalledWith({
            contactPhone: CALL.phone_number, source: 'staff_call', createdByAgentId: 'agent-1', assignedAgentId: 'agent-1',
            demand: { intent: 'buy', location: 'Sector 62', budgetMin: 4000000, budgetMax: 6000000 },
        });
        expect(r).toEqual({ dealId: 'deal-1', shared: 0 });
        expect(shareNextPropertyDetailed).not.toHaveBeenCalled();
        expect(refreshDealShortage).not.toHaveBeenCalled(); // new deal refreshes the book itself
    });

    it("keeps the contact's existing owner and refreshes the Shortage Book for an already-open deal", async () => {
        db.contact.findUnique.mockResolvedValue({ assigned_agent_id: 'owner-9' });
        (ensureDealForLead as any).mockResolvedValue({ dealId: 'deal-7', created: false, status: 'NEW' });
        await applyApprovedCall(CALL, { ...BUY, intent: 'RENT' }, 'agent-1', false);
        expect(ensureDealForLead).toHaveBeenCalledWith(expect.objectContaining({ assignedAgentId: 'owner-9', demand: expect.objectContaining({ intent: 'rent' }) }));
        expect(refreshDealShortage).toHaveBeenCalledWith('deal-7');
    });

    it('auto-shares up to three matches and stops at the first non-shared outcome', async () => {
        (shareNextPropertyDetailed as any)
            .mockResolvedValueOnce({ status: 'shared', inventoryId: 'a', matchScore: 80 })
            .mockResolvedValueOnce({ status: 'shared', inventoryId: 'b', matchScore: 70 })
            .mockResolvedValueOnce({ status: 'exhausted_notified' });
        const r = await applyApprovedCall(CALL, BUY, 'agent-1', true);
        expect(r.shared).toBe(2);
        expect(shareNextPropertyDetailed).toHaveBeenCalledTimes(3);

        (shareNextPropertyDetailed as any).mockReset().mockResolvedValue({ status: 'shared', inventoryId: 'x', matchScore: 90 });
        expect((await applyApprovedCall(CALL, BUY, 'agent-1', true)).shared).toBe(3);
        expect(shareNextPropertyDetailed).toHaveBeenCalledTimes(3); // capped
    });

    it('creates a listing-capture task (and no deal) for a sell call', async () => {
        const r = await applyApprovedCall(CALL, { intent: 'SELL', propertyType: 'flat', location: 'Noida', budgetMax: 80 }, 'agent-1', true);
        expect(ensureDealForLead).not.toHaveBeenCalled();
        expect(db.task.create).toHaveBeenCalledWith({ data: expect.objectContaining({
            task_type: 'CALL_LISTING_CAPTURE', assigned_to: 'agent-1', contact_phone: CALL.phone_number,
            stage_metadata: expect.objectContaining({ call_id: 'call-1', asking_lakhs_max: 80 }),
        }) });
        expect(r.listingTask).toBe(true);
    });

    it('does nothing for an unclear (OTHER) call', async () => {
        const r = await applyApprovedCall(CALL, { intent: 'OTHER' }, 'agent-1', true);
        expect(r).toEqual({ shared: 0 });
        expect(ensureDealForLead).not.toHaveBeenCalled();
        expect(db.task.create).not.toHaveBeenCalled();
    });

    it('turns a failure into a visible task instead of throwing', async () => {
        (ensureDealForLead as any).mockRejectedValue(new Error('db down'));
        const r = await applyApprovedCall(CALL, BUY, 'agent-1', true);
        expect(r.failed).toBe(true);
        expect(db.task.create).toHaveBeenCalledWith({ data: expect.objectContaining({ task_type: 'CALL_FOLLOWUP_FAILED', assigned_to: 'agent-1' }) });
    });
});
