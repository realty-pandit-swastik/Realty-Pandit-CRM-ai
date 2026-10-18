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
});
