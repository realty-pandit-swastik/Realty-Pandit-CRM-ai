import { describe, it, expect } from 'vitest';
import { expandNodeIds, bhkSpecsFilter } from '../utils/taxonomy_filter';

// Selecting a CATEGORY/SUBCATEGORY node must match inventory rows tagged with a descendant TYPE node,
// so the tree is expanded to self + all descendants before filtering on taxonomy_node_id.
describe('expandNodeIds', () => {
    const nodes = [
        { id: 'cat', parent_id: null },
        { id: 'sub1', parent_id: 'cat' },
        { id: 'sub2', parent_id: 'cat' },
        { id: 'type1', parent_id: 'sub1' },
        { id: 'type2', parent_id: 'sub1' },
    ];
    it('expands a category to all descendants', () => {
        expect(expandNodeIds(['cat'], nodes).sort()).toEqual(['cat', 'sub1', 'sub2', 'type1', 'type2']);
    });
    it('expands a subcategory to its types', () => {
        expect(expandNodeIds(['sub1'], nodes).sort()).toEqual(['sub1', 'type1', 'type2']);
    });
    it('a leaf type expands to itself', () => {
        expect(expandNodeIds(['type1'], nodes)).toEqual(['type1']);
    });
    it('an unknown id resolves to itself (no crash)', () => {
        expect(expandNodeIds(['ghost'], nodes)).toEqual(['ghost']);
    });
    it('multi-select unions the expansions', () => {
        expect(expandNodeIds(['sub2', 'type1'], nodes).sort()).toEqual(['sub2', 'type1']);
    });
});

// BHK lives in specs JSON under bhk (canonical) / rooms / bedrooms, as number OR string. The old
// inventory filter only checked specs.bedrooms → missed specs.bhk listings.
describe('bhkSpecsFilter', () => {
    it('builds an OR across bhk/rooms/bedrooms for number + string storage', () => {
        const f = bhkSpecsFilter([2]);
        expect(f!.OR).toEqual(expect.arrayContaining([
            { specs: { path: ['bhk'], equals: 2 } },
            { specs: { path: ['bhk'], equals: '2' } },
            { specs: { path: ['rooms'], equals: 2 } },
            { specs: { path: ['bedrooms'], equals: 2 } },
        ]));
    });
    it('empty selection → null (no filter)', () => {
        expect(bhkSpecsFilter([])).toBeNull();
    });
});
