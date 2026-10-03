import { beforeEach, expect, it, vi } from 'vitest';
import prisma from '../db';
import { MatchingEngine, meetsStrictStockRequirements } from '../services/matching_engine';

beforeEach(() => { vi.clearAllMocks(); vi.mocked(prisma.inventory.findMany).mockResolvedValue([]); });

it('strict stock rejects pending, missing BHK, unsuitable specifications and area', () => {
    const criteria = { tenant_id: 't', bhk_list: [2], demand_schema_values: { furnishing: 'furnished' }, area_min: 900, area_unit: 'sqft' };
    const stock = { status: 'active', tenant_id: 't', specs: { bhk: 2, furnishing: 'furnished', area: 1000, unit: 'sqft' } };
    expect(meetsStrictStockRequirements(criteria, stock)).toBe(true);
    expect(meetsStrictStockRequirements(criteria, { ...stock, status: 'pending_approval' })).toBe(false);
    expect(meetsStrictStockRequirements(criteria, { ...stock, tenant_id: 'other' })).toBe(false);
    expect(meetsStrictStockRequirements(criteria, { ...stock, specs: { ...stock.specs, bhk: 3 } })).toBe(false);
    expect(meetsStrictStockRequirements(criteria, { ...stock, specs: { ...stock.specs, furnishing: 'unfurnished' } })).toBe(false);
    expect(meetsStrictStockRequirements(criteria, { ...stock, specs: { ...stock.specs, area: 800 } })).toBe(false);
});

it('strict stock requires both requested type and location and examines older stock past ranking cap', async () => {
    await (new MatchingEngine() as any).searchProperties({ tenant_id: 't', strict_stock: true, property_type: 'flat', preferred_location: 'Sector 1' }, 3);
    const args: any = vi.mocked(prisma.inventory.findMany).mock.calls[0][0];
    expect(args.where.OR).toContainEqual({ type: { contains: 'flat', mode: 'insensitive' } });
    expect(args.where.AND[0].OR).toContainEqual({ locality: { contains: 'Sector 1', mode: 'insensitive' } });
    expect(args.where.AND[0].OR).not.toContainEqual({ type: { contains: 'flat', mode: 'insensitive' } });
    expect(args).not.toHaveProperty('take');
});
