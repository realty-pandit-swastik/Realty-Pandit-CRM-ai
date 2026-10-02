import { describe, it, expect } from 'vitest';
import {
    bhkListFromDemand,
    typeNodeListFromDemand,
    pickPrimaryFromList,
    buildMultiValueDemandPatch,
    validateMultiValueDemand,
    DEMAND_BHK_LIST_KEY,
    DEMAND_TYPE_NODE_LIST_KEY,
} from '../utils/demand_canonical';

describe('bhkListFromDemand', () => {
    it('prefers the explicit bhk_list set, deduped and sorted', () => {
        expect(bhkListFromDemand({ bhk_list: ['3', '2', '3'] })).toEqual([2, 3]);
    });
    it('falls back to the scalar bhk / rooms chain', () => {
        expect(bhkListFromDemand({ rooms: '4' })).toEqual([4]);
        expect(bhkListFromDemand({ bhk: '2' })).toEqual([2]);
    });
    it('returns empty for non-objects and unparseable scalars', () => {
        expect(bhkListFromDemand(null)).toEqual([]);
        expect(bhkListFromDemand({ bhk: 'studio' })).toEqual([]);
    });
});

describe('typeNodeListFromDemand', () => {
    it('prefers the stored list, deduped', () => {
        expect(typeNodeListFromDemand({ type_node_list: ['a', 'b', 'a'] })).toEqual(['a', 'b']);
    });
    it('falls back to the scalar node id', () => {
        expect(typeNodeListFromDemand({}, 'scalar-node')).toEqual(['scalar-node']);
        expect(typeNodeListFromDemand(null, null)).toEqual([]);
    });
});

describe('pickPrimaryFromList', () => {
    it('keeps the previous primary while still selected, else first', () => {
        expect(pickPrimaryFromList(['2', '3'], '3')).toBe('3');
        expect(pickPrimaryFromList(['2', '3'], '4')).toBe('2');
        expect(pickPrimaryFromList([], '2')).toBeNull();
    });
});

describe('buildMultiValueDemandPatch', () => {
    it('is byte-compatible for single-select saves', () => {
        const single = buildMultiValueDemandPatch({ bhkOptions: ['2'], typeNodeIds: ['node-a'] });
        expect(single.schema).toEqual({ bhk: '2' });
        expect(single.primaryTypeNodeId).toBe('node-a');
    });
    it('emits _list keys and a stable primary for multi-select saves', () => {
        const multi = buildMultiValueDemandPatch({ bhkOptions: ['2', '3'], previousBhk: '3', typeNodeIds: ['a', 'b'] });
        expect(multi.schema.bhk).toBe('3');
        expect(multi.schema[DEMAND_BHK_LIST_KEY]).toEqual(['2', '3']);
        expect(multi.schema[DEMAND_TYPE_NODE_LIST_KEY]).toEqual(['a', 'b']);
    });
});

function fakePrisma(kinds: Record<string, string>) {
    return {
        taxonomyNode: {
            findMany: async ({ where }: any) =>
                where.id.in
                    .filter((id: string) => id in kinds)
                    .map((id: string) => ({ id, node_kind: kinds[id] })),
        },
    };
}

describe('validateMultiValueDemand', () => {
    it('accepts a valid multi-value payload', async () => {
        const res = await validateMultiValueDemand(
            { bhk_list: ['2', '3 BHK'], type_node_list: ['t1', 't2'] },
            fakePrisma({ t1: 'TYPE', t2: 'TYPE' }),
        );
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.schema[DEMAND_BHK_LIST_KEY]).toEqual(['2', '3']);
            expect(res.schema[DEMAND_TYPE_NODE_LIST_KEY]).toEqual(['t1', 't2']);
        }
    });

    it('rejects invalid BHK values and non-TYPE nodes', async () => {
        expect((await validateMultiValueDemand({ bhk_list: ['blue'] }, fakePrisma({}))).ok).toBe(false);
        expect((await validateMultiValueDemand({ type_node_list: ['nope'] }, fakePrisma({}))).ok).toBe(false);
        expect((await validateMultiValueDemand({ type_node_list: ['c1'] }, fakePrisma({ c1: 'CATEGORY' }))).ok).toBe(false);
    });

    it('treats explicit null as a clear and absent keys as untouched', async () => {
        const res = await validateMultiValueDemand({ bhk_list: null }, fakePrisma({}));
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.schema).toEqual({});
    });
});
