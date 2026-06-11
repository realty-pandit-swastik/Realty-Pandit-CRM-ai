import { describe, it, expect } from 'vitest';
import { slotToScheduledAt, isVisitSlot } from '../utils/visit_schedule';

describe('slotToScheduledAt', () => {
    it('maps slots to the IST window start (expressed in UTC)', () => {
        // 2026-05-17 morning 09:00 IST = 03:30 UTC
        expect(slotToScheduledAt('2026-05-17', 'morning').toISOString())
            .toBe('2026-05-17T03:30:00.000Z');
        // afternoon 12:00 IST = 06:30 UTC
        expect(slotToScheduledAt('2026-05-17', 'afternoon').toISOString())
            .toBe('2026-05-17T06:30:00.000Z');
        // evening 16:00 IST = 10:30 UTC
        expect(slotToScheduledAt('2026-05-17', 'evening').toISOString())
            .toBe('2026-05-17T10:30:00.000Z');
    });

    it('throws on invalid date or slot', () => {
        expect(() => slotToScheduledAt('17-05-2026', 'morning')).toThrow();
        expect(() => slotToScheduledAt('2026-05-17', 'flexible' as any)).toThrow();
        expect(() => slotToScheduledAt('', 'morning')).toThrow();
    });

    it('isVisitSlot guards the slot set', () => {
        expect(isVisitSlot('morning')).toBe(true);
        expect(isVisitSlot('flexible')).toBe(false);
        expect(isVisitSlot('')).toBe(false);
        expect(isVisitSlot(undefined)).toBe(false);
    });
});
