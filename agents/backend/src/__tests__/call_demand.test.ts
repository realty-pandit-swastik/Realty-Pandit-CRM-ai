import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../utils/demand_taxonomy', () => ({ resolveDemandTaxonomy: vi.fn() }));
vi.mock('../db', () => ({ default: {} }));
vi.mock('../services/transcription', () => ({ default: {} }));
vi.mock('../services/call_extractor', () => ({ default: {} }));
import { resolveDemandTaxonomy } from '../utils/demand_taxonomy';
import { approvedCallFields } from '../services/call_demand';
beforeEach(() => { vi.mocked(resolveDemandTaxonomy).mockResolvedValue({ demand_taxonomy_node_id: 'flat', demand_schema_values: {}, needs_review: false, sub_category_id: null, category_id: null, type_id: null }); });
describe('call canonical demand', () => {
    it('preserves Studio/5+ BHK and converts lakh budgets only on CRM writes', async () => {
        expect(await approvedCallFields({ intent: 'BUY', propertyType: 'flat', bhk: 'Studio', budgetMin: 40, budgetMax: 60 })).toMatchObject({ budget_min: 4000000, budget_max: 6000000, demand_taxonomy_node_id: 'flat', demand_schema_values: { bhk: 'Studio' } });
        expect(await approvedCallFields({ bhk: '5+' })).toMatchObject({ demand_schema_values: { bhk: '5+' } });
    });
    it('keeps the shared form BHK list and specifications authoritative over the extraction', async () => {
        expect(await approvedCallFields({ bhk: '2', demand_schema_values: { bhk: '3', bhk_list: ['3', '4'], furnishing: 'furnished' } })).toMatchObject({ demand_schema_values: { bhk: '3', bhk_list: ['3', '4'], furnishing: 'furnished' } });
    });
    it('rejects unknown taxonomy selections', async () => {
        await expect(approvedCallFields({ demand_taxonomy_node_id: 'invalid' })).rejects.toThrow('Unknown demand taxonomy node');
    });
});
