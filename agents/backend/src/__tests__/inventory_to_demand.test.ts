import { describe, it, expect } from 'vitest';
import { buildDemandFromInventory } from '../services/inventory_to_demand';

const inv: any = {
    intent: 'sell', type: 'flat', category_id: 'c1', sub_category_id: 's1', type_id: 't1',
    taxonomy_node_id: 'node-3bhk', specs: { bhk: 3 },
    locality: 'Vaishali', city: 'Ghaziabad', display_price: 10000000,
    preferred_lat: null, preferred_lng: null,
};

describe('buildDemandFromInventory', () => {
    const d = buildDemandFromInventory(inv);
    it('maps sell -> buy intent', () => expect(d.intent).toBe('buy'));
    it('maps rent -> rent intent', () => expect(buildDemandFromInventory({ ...inv, intent: 'rent' }).intent).toBe('rent'));
    it('carries bhk + taxonomy + type ids', () => {
        expect(d.demand_bhk).toBe('3');
        expect(d.demand_taxonomy_node_id).toBe('node-3bhk');
        expect(d.type_id).toBe('t1');
    });
    it('location = locality + city', () => expect(d.preferred_location).toBe('Vaishali, Ghaziabad'));
    it('budget band brackets the listing price', () => {
        expect(d.budget_min).toBeLessThan(10000000);
        expect(d.budget_max).toBeGreaterThan(10000000);
    });
    it('no price -> null budget', () => {
        const d2 = buildDemandFromInventory({ ...inv, display_price: null, price: null, customer_price: null });
        expect(d2.budget_min).toBeNull();
        expect(d2.budget_max).toBeNull();
    });
});
