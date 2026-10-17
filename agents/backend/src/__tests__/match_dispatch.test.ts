import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../db';
import { dispatchContactMatches, dispatchLeadMatches } from '../services/match_dispatch';
import { ensureDealForLead } from '../services/ensure_deal';

const mocks = vi.hoisted(() => ({ match: vi.fn(), share: vi.fn(), hi: vi.fn(), active: vi.fn() }));
vi.mock('../utils/team_scope', () => ({ getTeamIds: vi.fn().mockResolvedValue(['agent-1']) }));
vi.mock('../services/matching_engine', () => ({
    MatchingEngine: class { findMatches = mocks.match; }, buildMatchCriteriaFromLead: (v: any) => v,
}));
vi.mock('../services/property_sharing', () => ({ shareSpecificProperty: mocks.share }));
vi.mock('../services/whatsapp', () => ({ WhatsAppService: class { sendTextStrict = mocks.hi; } }));
vi.mock('../services/session_tracker', () => ({ SessionTracker: { isSessionActive: mocks.active } }));
vi.mock('../services/ensure_deal', () => ({ ensureDealForLead: vi.fn().mockResolvedValue({ dealId: 'deal-1', created: true }) }));

const viewer = { id: 'agent-1', tenant_id: 'tenant-1', role: 'employee' };
const requestId = '12345678-1234-4234-8234-123456789012';
const phone = '+919000000001';
let receipts = new Map<string, any>();

beforeEach(() => {
    vi.clearAllMocks(); receipts = new Map();
    mocks.match.mockResolvedValue([{ id: 'inventory-1' }, { id: 'inventory-2' }]);
    mocks.share.mockReset().mockResolvedValue(true);
    mocks.hi.mockResolvedValue(undefined); mocks.active.mockResolvedValue(true);
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue({ id: 'deal-1', tenant_id: 'tenant-1',
        demand_intent: 'rent', demand_location: 'Enquiry location', demand_budget_max: 30000,
        demand_budget_min: 20000, demand_schema_values: { bhk: '2' },
        demand_contact: { phone_number: phone, name: 'Test person' } } as any);
    vi.mocked(prisma.inventory.findMany).mockResolvedValue([{ id: 'inventory-1' }, { id: 'inventory-2' }] as any);
    Object.assign(prisma.interaction, {
        findUnique: vi.fn(async ({ where }: any) => structuredClone(receipts.get(where.id) || null)),
        update: vi.fn(async ({ where, data }: any) => { receipts.set(where.id, structuredClone({ ...receipts.get(where.id), ...data })); return receipts.get(where.id); }),
        updateMany: vi.fn(async ({ where, data }: any) => {
            const r = receipts.get(where.id); if (r?.metadata.state !== 'failed') return { count: 0 };
            receipts.set(where.id, structuredClone({ ...r, ...data })); return { count: 1 };
        }),
    });
    vi.mocked(prisma.interaction.create).mockImplementation(async ({ data }: any) => {
        const id = data.id || `message-${receipts.size}`;
        if (receipts.has(id)) throw Object.assign(new Error('Unique key'), { code: 'P2002' });
        const record = structuredClone({ ...data, id }); receipts.set(id, record); return record;
    });
});

describe('one-tap match dispatch', () => {
    it('matches the enquiry snapshot, sends Hi, sends inventory and records a timestamped receipt', async () => {
        const result = await dispatchLeadMatches(viewer, 'deal-1', requestId);
        expect(mocks.match).toHaveBeenCalledWith(expect.objectContaining({
            budget_max: 30000, preferred_location: 'Enquiry location', tenant_id: 'tenant-1', intent: 'rent',
        }), 10);
        expect(mocks.hi).toHaveBeenCalledWith(phone, 'Hi');
        expect(result).toMatchObject({ state: 'sent', sent_inventory_ids: ['inventory-1', 'inventory-2'], hi_sent: true, timestamp: expect.any(String) });
        expect(receipts.get(requestId).content).toBe('Matches sent');
        expect((prisma.transaction.findFirst as any).mock.calls[0][0].where).toMatchObject({ tenant_id: 'tenant-1', OR: expect.any(Array) });
    });

    it('replays a successful request without repeating any provider sends', async () => {
        await dispatchLeadMatches(viewer, 'deal-1', requestId);
        const result = await dispatchLeadMatches(viewer, 'deal-1', requestId);
        expect(result.replayed).toBe(true);
        expect(mocks.hi).toHaveBeenCalledTimes(1); expect(mocks.share).toHaveBeenCalledTimes(2);
    });

    it('a concurrent double tap has only one send owner', async () => {
        const results = await Promise.allSettled([dispatchLeadMatches(viewer, 'deal-1', requestId), dispatchLeadMatches(viewer, 'deal-1', requestId)]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect(mocks.hi).toHaveBeenCalledTimes(1); expect(mocks.share).toHaveBeenCalledTimes(2);
    });

    it('retries only remaining inventory after a partial failure and never repeats Hi', async () => {
        mocks.share.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        await expect(dispatchLeadMatches(viewer, 'deal-1', requestId)).rejects.toMatchObject({ status: 502 });
        expect(receipts.get(requestId).metadata).toMatchObject({ state: 'failed', sent_inventory_ids: ['inventory-1'] });
        await dispatchLeadMatches(viewer, 'deal-1', requestId);
        expect(mocks.share.mock.calls.map(c => c[1])).toEqual(['inventory-1', 'inventory-2', 'inventory-2']);
        expect(mocks.hi).toHaveBeenCalledTimes(1);
    });

    it('outside the WhatsApp session shares templates but requires a personal Hi, never fakes that send', async () => {
        mocks.active.mockResolvedValue(false);
        const result = await dispatchLeadMatches(viewer, 'deal-1', requestId);
        expect(result).toMatchObject({ state: 'sent', hi_sent: false, greeting_status: 'manual_required' });
        expect(mocks.hi).not.toHaveBeenCalled(); expect(mocks.share).toHaveBeenCalledTimes(2);
    });

    it('denies another enquiry/tenant and never sends for placeholder phones', async () => {
        vi.mocked(prisma.transaction.findFirst).mockResolvedValueOnce(null);
        await expect(dispatchLeadMatches(viewer, 'hidden', requestId)).rejects.toMatchObject({ status: 404 });
        vi.mocked(prisma.transaction.findFirst).mockResolvedValueOnce({ id: 'deal-1', demand_contact: { phone_number: 'PENDING-9000000001', name: null } } as any);
        await expect(dispatchLeadMatches(viewer, 'deal-1', requestId)).rejects.toMatchObject({ status: 422 });
        expect(mocks.share).not.toHaveBeenCalled(); expect(prisma.interaction.create).not.toHaveBeenCalled();
    });

    it('does not log sent matches when there is no stock', async () => {
        mocks.match.mockResolvedValue([]); vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
        expect(await dispatchLeadMatches(viewer, 'deal-1', requestId)).toMatchObject({ state: 'no_matches' });
        expect(mocks.hi).not.toHaveBeenCalled(); expect(prisma.interaction.create).not.toHaveBeenCalled();
    });
    it('does not retry an uncertain in-progress send or reuse another handler’s receipt', async () => {
        receipts.set(requestId, { id: requestId, tenant_id: viewer.tenant_id, phone_number: phone, event_type: 'matches_sent',
            metadata: { deal_id: 'deal-1', by_agent_id: viewer.id, state: 'processing' } });
        await expect(dispatchLeadMatches(viewer, 'deal-1', requestId)).rejects.toMatchObject({ status: 409 });
        receipts.get(requestId).metadata.by_agent_id = 'another-agent';
        await expect(dispatchLeadMatches(viewer, 'deal-1', requestId)).rejects.toMatchObject({ status: 409 });
        expect(mocks.share).not.toHaveBeenCalled(); expect(mocks.hi).not.toHaveBeenCalled();
    });
    it('creates an actor-owned enquiry for a legacy contact-only tile and sends in the same action', async () => {
        vi.mocked(prisma.$queryRaw).mockResolvedValue([{ phone_number: phone }] as any);
        vi.mocked(prisma.contact.findFirst).mockResolvedValue({ phone_number: phone, name: 'Legacy contact' } as any);
        vi.mocked(prisma.transaction.findFirst).mockResolvedValueOnce(null);
        const result = await dispatchContactMatches(viewer, '9000000001', requestId);
        expect(result.state).toBe('sent');
        expect(ensureDealForLead).toHaveBeenCalledWith(expect.objectContaining({ contactPhone: phone, assignedAgentId: viewer.id, newEnquiry: true }));
        await dispatchContactMatches(viewer, phone, requestId);
        expect(ensureDealForLead).toHaveBeenCalledTimes(1);
        expect(mocks.share).toHaveBeenCalledTimes(2);
    });
});
