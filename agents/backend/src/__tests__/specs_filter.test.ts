import { describe, it, expect } from 'vitest';
import {
    valueVariants,
    specsScalarFilter,
    specsArrayContainsFilter,
} from '../utils/specs_filter';

describe('valueVariants', () => {
    it('expands a snake_case slug to slug + spaced + hyphenated Title Case (deduped)', () => {
        expect(new Set(valueVariants('fully_furnished'))).toEqual(
            new Set(['fully_furnished', 'Fully Furnished', 'Fully-Furnished']),
        );
    });

    it('expands a stored hyphenated label back to the slug form so filters match either', () => {
        // prod stores "Semi-Furnished"; website sends "semi_furnished" — both must resolve to a common set
        expect(new Set(valueVariants('Semi-Furnished'))).toEqual(
            new Set(['Semi-Furnished', 'Semi Furnished', 'semi_furnished']),
        );
    });

    it('collapses a single-word value to just slug + capitalized', () => {
        expect(new Set(valueVariants('lift'))).toEqual(new Set(['lift', 'Lift']));
    });
});

describe('specsScalarFilter', () => {
    it('returns null when there are no values', () => {
        expect(specsScalarFilter('furnishing', [])).toBeNull();
    });

    it('builds an OR of specs path-equals over every variant of every value', () => {
        const f = specsScalarFilter('furnishing', ['fully_furnished']);
        expect(f).not.toBeNull();
        expect(f!.OR).toEqual(
            expect.arrayContaining([
                { specs: { path: ['furnishing'], equals: 'fully_furnished' } },
                { specs: { path: ['furnishing'], equals: 'Fully Furnished' } },
                { specs: { path: ['furnishing'], equals: 'Fully-Furnished' } },
            ]),
        );
    });

    it('includes variants for all values in a multi-select', () => {
        const f = specsScalarFilter('furnishing', ['fully_furnished', 'unfurnished']);
        const equalsValues = f!.OR.map((c: any) => c.specs.equals);
        expect(equalsValues).toContain('Fully Furnished');
        expect(equalsValues).toContain('Unfurnished');
    });
});

describe('specsArrayContainsFilter', () => {
    it('returns one AND-clause per requested value, each OR-ing the variants', () => {
        const clauses = specsArrayContainsFilter('amenities', ['lift', 'power_backup']);
        expect(clauses).toHaveLength(2);
        expect(clauses[0].OR).toEqual(
            expect.arrayContaining([
                { specs: { path: ['amenities'], array_contains: 'lift' } },
                { specs: { path: ['amenities'], array_contains: 'Lift' } },
            ]),
        );
        expect(clauses[1].OR).toEqual(
            expect.arrayContaining([
                { specs: { path: ['amenities'], array_contains: 'Power Backup' } },
            ]),
        );
    });

    it('returns an empty array when there are no values', () => {
        expect(specsArrayContainsFilter('amenities', [])).toEqual([]);
    });
});
