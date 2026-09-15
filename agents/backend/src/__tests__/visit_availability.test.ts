import { describe, it, expect } from 'vitest';
import { parseVisitAvailability } from '../utils/visit_availability';

const NOW = new Date('2026-06-12T06:00:00Z'); // 11:30 IST on 2026-06-12

describe('parseVisitAvailability (Fix B)', () => {
    it('parses Hinglish today/tomorrow/parso + slot', () => {
        expect(parseVisitAvailability('kal subah', NOW)).toEqual({ dateISO: '2026-06-13', slot: 'morning' });
        expect(parseVisitAvailability('aaj shaam', NOW)).toEqual({ dateISO: '2026-06-12', slot: 'evening' });
        expect(parseVisitAvailability('parso dopahar', NOW)).toEqual({ dateISO: '2026-06-14', slot: 'afternoon' });
    });

    it('parses English + a clock time', () => {
        expect(parseVisitAvailability('tomorrow at 5 pm', NOW)).toEqual({ dateISO: '2026-06-13', slot: 'evening' });
        expect(parseVisitAvailability('today morning', NOW)).toEqual({ dateISO: '2026-06-12', slot: 'morning' });
        expect(parseVisitAvailability('11 am', NOW)).toEqual({ dateISO: '2026-06-12', slot: 'morning' });
    });

    it('defaults: slot-only -> today; date-only -> morning', () => {
        expect(parseVisitAvailability('evening', NOW)).toEqual({ dateISO: '2026-06-12', slot: 'evening' });
        expect(parseVisitAvailability('kal', NOW)).toEqual({ dateISO: '2026-06-13', slot: 'morning' });
    });

    it('parses a bare weekday as the NEXT occurrence (future, right slot)', () => {
        const r = parseVisitAvailability('saturday morning', NOW);
        expect(r).not.toBeNull();
        expect(r!.slot).toBe('morning');
        expect(r!.dateISO > '2026-06-12').toBe(true);
    });

    it('returns null when nothing is parseable (caller re-asks)', () => {
        expect(parseVisitAvailability('hello', NOW)).toBeNull();
        expect(parseVisitAvailability('ok thanks', NOW)).toBeNull();
        expect(parseVisitAvailability('', NOW)).toBeNull();
    });
});
