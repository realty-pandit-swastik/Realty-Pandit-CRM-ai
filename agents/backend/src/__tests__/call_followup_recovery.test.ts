import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
    staffCall: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    contact: { findUnique: vi.fn() }, transaction: { updateMany: vi.fn() },
    task: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() }, $transaction: vi.fn(),
}));
vi.mock('../db', () => ({ default: db }));
vi.mock('../services/ensure_deal', () => ({ ensureDealForLead: vi.fn() }));
vi.mock('../services/shortage_book', () => ({ refreshDealShortage: vi.fn() }));
vi.mock('../services/property_sharing', () => ({ shareNextPropertyDetailed: vi.fn() }));
vi.mock('../services/call_demand', () => ({ approvedCallFields: vi.fn().mockResolvedValue({ intent: 'buy', demand_taxonomy_node_id: 'flat', demand_schema_values: { bhk: '2' } }) }));
vi.mock('../services/transcription', () => ({ default: {} }));
vi.mock('../services/call_extractor', () => ({ default: {} }));
import { runCallFollowup, recoverCallFollowups } from '../services/call_followup';
import { ensureDealForLead } from '../services/ensure_deal';
import { shareNextPropertyDetailed } from '../services/property_sharing';

const CALL = { id: 'c1', tenant_id: 't1', staff_agent_id: 'a1', phone_number: '+919800000001', status: 'APPROVED', auto_share: true, followup_attempts: 1, staff_edited_data: { final_data: { intent: 'BUY', propertyType: 'flat', bhk: '2' } } };
beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation(async fn => fn(db));
    db.staffCall.updateMany.mockResolvedValue({ count: 1 });
    db.staffCall.findUnique.mockResolvedValue({ ...CALL });
    db.staffCall.findMany.mockResolvedValue([]);
    db.contact.findUnique.mockResolvedValue({ tenant_id: 't1', assigned_agent_id: 'a1' });
    db.task.findFirst.mockResolvedValue(null);
    db.task.create.mockResolvedValue({ id: 'task1' });
    vi.mocked(ensureDealForLead).mockResolvedValue({ dealId: 'd1', created: false, status: 'QUALIFIED' });
    vi.mocked(shareNextPropertyDetailed).mockResolvedValue({ status: 'shared', inventoryId: 'i1', matchScore: 80 });
});

describe('durable approved call followup', () => {
    it('only one concurrent worker claims an outbox item', async () => {
        let taken = false;
        db.staffCall.updateMany.mockImplementation(async args => {
            if (args.data.followup_status === 'RUNNING') {
                if (taken) return { count: 0 };
                taken = true;
            }
            return { count: 1 };
        });
        const results = await Promise.all([runCallFollowup('c1'), runCallFollowup('c1')]);
        expect(results.filter(Boolean)).toHaveLength(1);
        expect(ensureDealForLead).toHaveBeenCalledTimes(1);
        expect(shareNextPropertyDetailed).toHaveBeenCalledTimes(3);
    });
    it('restart resumes the persisted deal and share count instead of another three shares', async () => {
        db.staffCall.findUnique.mockResolvedValue({ ...CALL, followup_result: { dealId: 'd1', shared: 2 } });
        expect(await runCallFollowup('c1')).toMatchObject({ dealId: 'd1', shared: 3 });
        expect(ensureDealForLead).not.toHaveBeenCalled();
        expect(db.transaction.updateMany).not.toHaveBeenCalled();
        expect(shareNextPropertyDetailed).toHaveBeenCalledTimes(1);
        expect(db.staffCall.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ followup_result: expect.objectContaining({ shared: 3 }) }) }));
    });
    it('fences stale ownership before matching or sending', async () => {
        db.staffCall.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValue({ count: 0 });
        expect(await runCallFollowup('c1')).toMatchObject({ failed: true });
        expect(ensureDealForLead).not.toHaveBeenCalled();
        expect(shareNextPropertyDetailed).not.toHaveBeenCalled();
        expect(db.task.create).not.toHaveBeenCalled();
    });
    it('returns failed cross-tenant work without creating a deal', async () => {
        db.contact.findUnique.mockResolvedValue({ tenant_id: 'other' });
        expect(await runCallFollowup('c1')).toMatchObject({ failed: true });
        expect(ensureDealForLead).not.toHaveBeenCalled();
        expect(db.task.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ assigned_to: 'a1', task_type: 'CALL_FOLLOWUP_FAILED' }) }));
    });
    it('listing capture task and outbox completion are one fenced transaction', async () => {
        db.staffCall.findUnique.mockResolvedValue({ ...CALL, staff_edited_data: { final_data: { intent: 'SELL', bhk: '3', propertyType: 'flat' } } });
        expect(await runCallFollowup('c1')).toEqual({ shared: 0, listingTask: true });
        expect(db.$transaction).toHaveBeenCalledTimes(1);
        expect(db.task.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ task_type: 'CALL_LISTING_CAPTURE', stage_metadata: { call_id: 'c1', verified_data: { intent: 'SELL', bhk: '3', propertyType: 'flat' } } }) }));
        expect(ensureDealForLead).not.toHaveBeenCalled();
    });
    it('an interrupted final attempt is exposed as FAILED for explicit retry', async () => {
        await recoverCallFollowups();
        expect(db.staffCall.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ followup_attempts: { gte: 3 }, followup_status: 'RUNNING' }), data: expect.objectContaining({ followup_status: 'FAILED', followup_claim_token: null }) }));
    });
});
