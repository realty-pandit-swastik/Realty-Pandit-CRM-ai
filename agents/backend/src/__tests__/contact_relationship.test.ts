import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../db';
import { contactRelationship, visibleContact } from '../services/contact_relationship';
vi.mock('../utils/team_scope', () => ({ getTeamIds: vi.fn().mockResolvedValue(['agent-1']) }));
const viewer = { id: 'agent-1', tenant_id: 'tenant-1', role: 'employee' };
const phone = '+919000000001';
beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ phone_number: phone }] as any);
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({ phone_number: phone, name: 'Same person', email: null, contact_type: 'BUYER', client_role: 'CLIENT' } as any);
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([
        { id: 'deal-2', source: 'magicbricks', source_ref: '84110871', status: 'NEW', demand_budget_max: 9000000, demand_location: 'B', created_at: new Date('2026-10-17T02:00:00Z') },
        { id: 'deal-1', source: '99acres', source_ref: '85225923', status: 'VISITED', demand_budget_max: 5000000, demand_location: 'A', created_at: new Date('2026-10-16T02:00:00Z') },
    ] as any);
    vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
    vi.mocked(prisma.interaction.findMany).mockResolvedValue([
        { id: 'visible-event', event_type: 'matches_sent', content: 'Matches sent', created_at: new Date('2026-10-17T03:00:00Z'), metadata: { deal_id: 'deal-2', sent_inventory_ids: ['inv-1'] } },
        { id: 'hidden-event', event_type: 'note', content: 'Other enquiry confidential note', created_at: new Date(), metadata: { deal_id: 'other-agent-deal' } },
    ] as any);
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([]); vi.mocked(prisma.staffCall.findMany).mockResolvedValue([]);
    Object.assign(prisma, { whatsAppMessage: { findMany: vi.fn().mockResolvedValue([]) }, transactionLog: { findMany: vi.fn().mockResolvedValue([]) } });
    Object.assign(prisma.scheduledVisit, { findMany: vi.fn().mockResolvedValue([]) });
});
describe('contact relationship', () => {
    it('uses the normalized stored contact key and preserves every accessible enquiry snapshot', async () => {
        const result = await contactRelationship('90000 00001', viewer, 1);
        expect(result.leads).toHaveLength(2);
        expect(result.leads.map(l => l.source_ref)).toEqual(['84110871', '85225923']);
        expect(result.leads.map(l => l.demand_budget_max)).toEqual([9000000, 5000000]);
        expect((prisma.contact.findFirst as any).mock.calls[0][0].where).toMatchObject({ AND: [expect.objectContaining({ tenant_id: 'tenant-1' }), { phone_number: phone }] });
    });
    it('filters other handlers’ enquiry events and orders the single timeline newest first', async () => {
        const result = await contactRelationship(phone, viewer, 1);
        expect(result.timeline.map(e => e.id)).not.toContain('hidden-event');
        expect(result.timeline[0].content).toBe('Matches sent');
        expect(result.timeline.filter(e => e.event_type === 'lead_created')).toHaveLength(2);
    });
    it('denies an invisible contact before reading any relationship history', async () => {
        vi.mocked(prisma.contact.findFirst).mockResolvedValue(null);
        await expect(visibleContact(phone, viewer)).rejects.toMatchObject({ status: 404 });
        expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    });
    it('paginates timeline events without losing or duplicating historical lead entries', async () => {
        vi.mocked(prisma.interaction.findMany).mockResolvedValue(Array.from({ length: 65 }, (_, i) => ({ id: `event-${i}`, event_type: 'note', content: `Note ${i}`, created_at: new Date(Date.UTC(2026, 10, 1, 0, i)), metadata: {} })) as any);
        const first = await contactRelationship(phone, viewer, 1); const second = await contactRelationship(phone, viewer, 2);
        expect(first.timeline).toHaveLength(50); expect(first.has_more).toBe(true);
        expect(second.timeline).toHaveLength(17); expect(second.has_more).toBe(false);
        expect(new Set([...first.timeline, ...second.timeline].map(e => e.id)).size).toBe(67);
    });
    it('includes WhatsApp and deal status history while dropping internal portal payloads', async () => {
        vi.mocked(prisma.interaction.findMany).mockResolvedValue([{ id: 'capture', event_type: 'lead_capture', content: 'Portal enquiry', created_at: new Date('2026-10-17T03:00:00Z'), metadata: { deal_id: 'deal-1', original_data: { private_provider_field: 'redact-me' } } }] as any);
        (prisma.whatsAppMessage.findMany as any).mockResolvedValue([{ id: 'wa-1', direction: 'outbound', status: 'delivered', body: 'Hello', message_type: 'text', created_at: new Date('2026-10-17T04:00:00Z') }]);
        (prisma.transactionLog.findMany as any).mockResolvedValue([{ id: 'log-1', transaction_id: 'deal-1', action: 'STATUS_CHANGED', old_status: 'NEW', new_status: 'QUALIFIED', created_at: new Date('2026-10-17T05:00:00Z') }]);
        const result = await contactRelationship(phone, viewer, 1);
        expect(result.timeline.some(e => e.content?.includes('WhatsApp delivered'))).toBe(true);
        expect(result.timeline.some(e => e.content?.includes('NEW → QUALIFIED'))).toBe(true);
        expect(JSON.stringify(result)).not.toContain('redact-me');
    });

    it('returns key-holder, owner and partner relationships from the same permission-scoped query', async () => {
        vi.mocked(prisma.inventory.findMany).mockResolvedValue([
            { id: 'both', owner_phone: phone, key_holder_phone: '9000000001', assigned_agent_id: 'agent-1', status: 'active' },
            { id: 'partner-property', owner_phone: '+919000000009', referral_partner: { phone_number: phone }, assigned_agent_id: 'agent-1', status: 'active' },
        ] as any);
        const result = await contactRelationship(phone, viewer, 1);
        expect(result.inventory[0].relationships).toEqual(['Owner', 'Key holder']);
        expect(result.inventory[1].relationships).toEqual(['Partner']);
        expect(result.counts).toMatchObject({ inventory: 1, key_holder: 1, leads: 2, deals: 2, other: 1 });
        expect(prisma.inventory.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
            AND: [expect.objectContaining({ tenant_id: 'tenant-1', OR: expect.any(Array) }), expect.objectContaining({ OR: expect.any(Array) })],
        } }));
        expect(JSON.stringify(result.inventory)).not.toContain('phone_number');
        expect(JSON.stringify(result.inventory)).not.toContain('owner_phone');
    });

    it('caps relation pages and retains total counts without losing relationships on show more', async () => {
        vi.mocked(prisma.inventory.findMany).mockResolvedValue(Array.from({ length: 65 }, (_, i) => ({ id: `inv-${i}`, owner_phone: phone, assigned_agent_id: 'agent-1', status: 'active' })) as any);
        const first = await contactRelationship(phone, viewer, 1);
        const second = await contactRelationship(phone, viewer, 2);
        expect(first.inventory).toHaveLength(50); expect(first.has_more_relationships).toBe(true);
        expect(second.inventory).toHaveLength(15); expect(second.has_more_relationships).toBe(false);
        expect(first.counts.inventory).toBe(65);
    });

    it('keeps empty relationships distinct from an inaccessible contact', async () => {
        vi.mocked(prisma.transaction.findMany).mockResolvedValue([]);
        vi.mocked(prisma.interaction.findMany).mockResolvedValue([]);
        const result = await contactRelationship(phone, viewer, 1);
        expect(result.leads).toEqual([]); expect(result.inventory).toEqual([]);
        expect(result.counts).toEqual({ leads: 0, inventory: 0, key_holder: 0, deals: 0, other: 0 });
    });
});
