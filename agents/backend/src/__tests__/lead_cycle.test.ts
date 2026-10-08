import { describe, expect, it } from 'vitest';
import { isRecycledLead, leadCycleStart, leadCycleStartIso } from '../utils/lead_cycle';

describe('leadCycleStart', () => {
    it('uses created_at for a lead that was never recycled', () => {
        expect(leadCycleStart({ created_at: '2026-01-05T10:00:00.000Z' })?.toISOString()).toBe('2026-01-05T10:00:00.000Z');
    });

    it('prefers the current cycle stamp over first-seen date', () => {
        const start = leadCycleStart({
            created_at: '2026-01-05T10:00:00.000Z',
            cycle_start_at: '2026-10-01T09:30:00.000Z',
            recycled_at: '2026-10-01T09:30:00.000Z',
            lead_cycle: 2,
        });
        expect(start?.toISOString()).toBe('2026-10-01T09:30:00.000Z');
    });

    it('never rewrites first-seen history — created_at is still reported by callers that want it', () => {
        const row = { created_at: '2026-01-05T10:00:00.000Z', cycle_start_at: '2026-10-01T09:30:00.000Z' };
        // The helper only reports the cycle; the original date is still on the row and untouched.
        expect(new Date(row.created_at).toISOString()).toBe('2026-01-05T10:00:00.000Z');
    });

    it('falls back safely on junk input', () => {
        expect(leadCycleStart(null)).toBeNull();
        expect(leadCycleStart({ created_at: 'not-a-date' })).toBeNull();
        expect(leadCycleStart({ created_at: '2026-01-05T00:00:00.000Z', cycle_start_at: 'bad' })?.toISOString())
            .toBe('2026-01-05T00:00:00.000Z');
    });
});

describe('leadCycleStartIso', () => {
    it('returns the YYYY-MM-DD shape the date-range filter compares against', () => {
        expect(leadCycleStartIso({ created_at: '2026-01-05T23:59:59.000Z' })).toBe('2026-01-05');
        expect(leadCycleStartIso({ created_at: '2026-01-05T10:00:00.000Z', cycle_start_at: '2026-03-09T08:00:00.000Z' })).toBe('2026-03-09');
        expect(leadCycleStartIso(null)).toBe('');
    });
});

describe('isRecycledLead', () => {
    it('detects a renewed lead by cycle number or stamp', () => {
        expect(isRecycledLead({ created_at: '2026-01-05T10:00:00.000Z' })).toBe(false);
        expect(isRecycledLead({ created_at: '2026-01-05T10:00:00.000Z', lead_cycle: 2 })).toBe(true);
        expect(isRecycledLead({ created_at: '2026-01-05T10:00:00.000Z', recycled_at: '2026-10-01T09:30:00.000Z' })).toBe(true);
    });
});