import { describe, it, expect } from 'vitest';

/**
 * Cross-package contract for the CRM lead-tile display helpers.
 *
 * `agents/frontend` has no test runner, so these pure functions are covered from the backend
 * suite (the only package with one). They are plain TS with no DOM/React dependency.
 * See lib/leadDisplay.ts — consumed by LeadCard and the Ext. Leads desktop rows.
 */
import { bhkLabel, stageInfo, STAGE_META } from '../../../frontend/src/lib/leadDisplay';

describe('bhkLabel', () => {
    it('reads the canonical demand_schema_values.bhk first', () => {
        expect(bhkLabel({ demand_schema_values: { bhk: '2' } })).toBe('2 BHK');
        expect(bhkLabel({ demand_schema_values: { bhk: '3' }, demand_bhk: 9 })).toBe('3 BHK');
    });

    it('handles numeric values', () => {
        expect(bhkLabel({ demand_schema_values: { bhk: 2 } })).toBe('2 BHK');
    });

    it('renders RK variants', () => {
        expect(bhkLabel({ demand_schema_values: { bhk: '1 RK' } })).toBe('1 RK');
        expect(bhkLabel({ demand_schema_values: { bhk: '1rk' } })).toBe('1 RK');
    });

    it('passes a non-numeric label through unchanged', () => {
        expect(bhkLabel({ demand_schema_values: { bhk: 'Studio' } })).toBe('Studio');
    });

    it('falls back to the legacy demand_bhk mirror', () => {
        // Set by optimistic saves in Ext. Leads; absent on a fresh server load.
        expect(bhkLabel({ demand_bhk: 2 })).toBe('2 BHK');
    });

    it('returns null rather than rendering a meaningless badge', () => {
        expect(bhkLabel({})).toBeNull();
        expect(bhkLabel({ demand_schema_values: {} })).toBeNull();
        expect(bhkLabel({ demand_schema_values: { bhk: '' } })).toBeNull();
        expect(bhkLabel({ demand_schema_values: { bhk: null }, demand_bhk: null })).toBeNull();
        expect(bhkLabel(null)).toBeNull();
    });

    it('never renders a 0 / negative / multi-value BHK', () => {
        // "0 BHK" is noise on a tile, and a multi-value field must not stringify into a badge.
        expect(bhkLabel({ demand_schema_values: { bhk: '0' } })).toBeNull();
        expect(bhkLabel({ demand_bhk: 0 })).toBeNull();
        expect(bhkLabel({ demand_schema_values: { bhk: -1 } })).toBeNull();
        expect(bhkLabel({ demand_schema_values: { bhk: ['2', '3'] as any } })).toBeNull();
    });
});

describe('stageInfo', () => {
    it('labels every known stage', () => {
        for (const [key, meta] of Object.entries(STAGE_META)) {
            expect(stageInfo(key).label).toBe(meta.label);
            expect(stageInfo(key.toLowerCase()).label).toBe(meta.label);
        }
    });

    it('treats a missing stage as New (the schema default) and maps the legacy LEAD alias', () => {
        expect(stageInfo(null).label).toBe('New');
        expect(stageInfo(undefined).label).toBe('New');
        expect(stageInfo('LEAD').label).toBe('New');
    });

    it('still shows an unknown stage rather than hiding it', () => {
        // A value from a newer deploy (or hand-edited row) must not blank the tile.
        const s = stageInfo('SOMETHING_NEW');
        expect(s.label).toBe('SOMETHING_NEW');
        expect(s.color).toBeTruthy();
    });
});