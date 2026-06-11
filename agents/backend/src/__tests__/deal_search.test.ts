import { describe, it, expect, vi, beforeEach } from 'vitest';
import prisma from '../db';
import { listDeals } from '../services/deal_service';

beforeEach(() => vi.clearAllMocks());

// Deals search used to match ONLY contact name+phone (address → 0 results, verified live).
// It is now tokenized and matches contact name/phone/preferred_location AND the linked property's
// address — in any word order.
describe('listDeals search — tokenized contact + property address', () => {
    it('builds an AND of per-term groups covering contact + preferred_location + linked property', async () => {
        (prisma.transaction.findMany as any).mockResolvedValue([]);
        (prisma.transaction.count as any).mockResolvedValue(0);

        await listDeals({ tenant_id: 't1', search: 'Vaishali Ghaziabad' });

        const where = (prisma.transaction.findMany as any).mock.calls.at(-1)[0].where;
        expect(where.AND).toHaveLength(2); // two terms → two AND-ed groups
        const term1 = where.AND[0].OR as any[];

        const invBranch = term1.find(b => b.inventory);
        expect(invBranch.inventory.OR).toEqual(expect.arrayContaining([
            { city: { contains: 'Vaishali', mode: 'insensitive' } },
            { full_address: { contains: 'Vaishali', mode: 'insensitive' } },
        ]));

        const demandBranch = term1.find(b => b.demand_contact);
        expect(demandBranch.demand_contact.OR).toEqual(expect.arrayContaining([
            { name: { contains: 'Vaishali', mode: 'insensitive' } },
            { preferred_location: { contains: 'Vaishali', mode: 'insensitive' } },
        ]));
    });

    it('a digit term adds phone_number matches to the contact branches', async () => {
        (prisma.transaction.findMany as any).mockResolvedValue([]);
        (prisma.transaction.count as any).mockResolvedValue(0);

        await listDeals({ tenant_id: 't1', search: '9958' });

        const where = (prisma.transaction.findMany as any).mock.calls.at(-1)[0].where;
        const demandBranch = (where.AND[0].OR as any[]).find(b => b.demand_contact);
        expect(demandBranch.demand_contact.OR.some((f: any) => f.phone_number)).toBe(true);
    });
});
