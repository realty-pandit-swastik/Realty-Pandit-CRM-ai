import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
    default: {
        transaction: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
        contact: { findFirst: vi.fn() },
        dealReminder: { findFirst: vi.fn() },
        task: { count: vi.fn() },
        appointment: { count: vi.fn() },
        interaction: { count: vi.fn() },
    },
}));

import prisma from '../db';
import { listDeals } from '../services/deal_service';

/**
 * Exact one-lead scope (2026-10-09) — the Ext. Leads "Pipeline" button narrows the board to the
 * tapped lead. This is an equality match on demand_contact_id (which IS the Contact PK).
 *
 * The regression this guards: routing the same intent through the tokenized `search` box would
 * digit-strip the term, so a placeholder key like "PENDING-9812345678-m1" would match the
 * DEALER's number and pull in a different person's deals.
 */
beforeEach(() => {
    vi.clearAllMocks();
    (prisma.transaction.findMany as any).mockResolvedValue([]);
    (prisma.dealReminder.findFirst as any).mockResolvedValue(null);
    (prisma.task.count as any).mockResolvedValue(0);
    (prisma.appointment.count as any).mockResolvedValue(0);
    (prisma.interaction.count as any).mockResolvedValue(0);
});

const lastWhere = () => (prisma.transaction.findMany as any).mock.calls[0][0].where;

describe('listDeals — contact_phone exact scope', () => {
    it('matches the contact exactly via demand_contact_id', async () => {
        await listDeals({ tenant_id: 't1', contact_phone: '+9198368437972', limit: 20 });

        expect(lastWhere().AND).toContainEqual({ demand_contact_id: '+9198368437972' });
    });

    it('matches a placeholder key verbatim — never digit-stripped into the dealer number', async () => {
        const placeholder = 'PENDING-9812345678-m1';
        await listDeals({ tenant_id: 't1', contact_phone: placeholder, limit: 20 });

        const and = lastWhere().AND;
        expect(and).toContainEqual({ demand_contact_id: placeholder });
        // The dealer number must NOT appear anywhere in the where clause.
        expect(JSON.stringify(lastWhere())).not.toContain('9812345678"');
    });

    it('narrows within tenant + team scope instead of replacing it', async () => {
        await listDeals({ tenant_id: 't1', team_ids: ['a1', 'a2'], contact_phone: '+919000000010' });

        const w = lastWhere();
        expect(w.tenant_id).toBe('t1');
        const and = w.AND;
        // Team visibility group AND the contact group must both be present.
        expect(and.some((g: any) => g.OR?.some((c: any) => c.coordinator_agent_id?.in))).toBe(true);
        expect(and).toContainEqual({ demand_contact_id: '+919000000010' });
    });

    it('reveals closed and on-hold deals for the scoped lead', async () => {
        // hide_closed is the board's default; without this a lead whose only deal is Won would
        // show an empty board and read as "no deals".
        await listDeals({ tenant_id: 't1', hide_closed: true, contact_phone: '+919000000010' });

        expect(lastWhere().status).toBeUndefined();
    });

    it('still honours hide_closed when no lead scope is set', async () => {
        await listDeals({ tenant_id: 't1', hide_closed: true, limit: 20 });

        expect(lastWhere().status).toEqual({ notIn: ['CLOSED_WON', 'CLOSED_LOST', 'ON_HOLD'] });
    });

    it('ignores an empty contact_phone instead of matching everything', async () => {
        await listDeals({ tenant_id: 't1', contact_phone: '   ', limit: 20 });

        expect(JSON.stringify(lastWhere())).not.toContain('demand_contact_id');
    });

    it('coexists with an explicit status filter', async () => {
        await listDeals({ tenant_id: 't1', status: 'NEW', contact_phone: '+919000000010' });

        const w = lastWhere();
        expect(w.status).toBe('NEW');
        expect(w.AND).toContainEqual({ demand_contact_id: '+919000000010' });
    });
});