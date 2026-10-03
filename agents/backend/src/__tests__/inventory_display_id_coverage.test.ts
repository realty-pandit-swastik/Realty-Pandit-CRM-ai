import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const hooks = vi.hoisted(() => ({ value: null as any, mint: vi.fn() }));
vi.mock('@prisma/client', () => ({ PrismaClient: class {
    $extends(value: any) { hooks.value = value.query.inventory; return {}; }
} }));
vi.mock('../utils/inventory_id', () => ({ generateDisplayId: hooks.mint }));
beforeAll(async () => { await vi.importActual('../db'); });
beforeEach(() => { hooks.mint.mockReset().mockResolvedValue('RP-DEL-RES-20001'); });
describe('Property ID coverage', () => {
    it('direct create generates an ID at the shared write boundary', async () => {
        const args: any = { data: { city: 'Delhi', category: 'residential' } };
        await hooks.value.create({ args, query: vi.fn(async () => ({ status: 'pending_approval' })) });
        expect(args.data.display_id).toBe('RP-DEL-RES-20001');
        expect(hooks.mint).toHaveBeenCalledWith('Delhi', 'residential');
    });
    it('bulk create preserves existing IDs and fills missing IDs', async () => {
        const args: any = { data: [{ display_id: 'RP-EXISTING' }, { city: 'Delhi' }] };
        await hooks.value.createMany({ args, query: vi.fn() });
        expect(args.data.map((row: any) => row.display_id)).toEqual(['RP-EXISTING', 'RP-DEL-RES-20001']);
        expect(hooks.mint).toHaveBeenCalledTimes(1);
    });
    it('upsert sets only the creation ID and leaves the existing record update unchanged', async () => {
        const args: any = { create: { city: 'Delhi' }, update: { price: 5000000 } };
        await hooks.value.upsert({ args, query: vi.fn() });
        expect(args.create.display_id).toBe('RP-DEL-RES-20001');
        expect(args.update).toEqual({ price: 5000000 });
    });
    it('an explicit ID survives direct creation without another counter increment', async () => {
        const args: any = { data: { display_id: 'RP-EXISTING' } };
        await hooks.value.create({ args, query: vi.fn(async () => ({ status: 'pending_approval' })) });
        expect(args.data.display_id).toBe('RP-EXISTING');
        expect(hooks.mint).not.toHaveBeenCalled();
    });
});
