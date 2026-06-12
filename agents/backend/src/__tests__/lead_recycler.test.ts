import { describe, it, expect } from 'vitest';
import { pickForAgent, isJunkPhone } from '../services/lead_recycler';

const L = (p: string, d: string) => ({ phone_number: p, created_at: new Date(d) });

describe('lead_recycler pick logic', () => {
    it('isJunkPhone flags placeholders / malformed', () => {
        expect(isJunkPhone('+TEMP_abc')).toBe(true);
        expect(isJunkPhone('+PENDING-x')).toBe(true);
        expect(isJunkPhone('+91')).toBe(true);
        expect(isJunkPhone('not-a-phone')).toBe(true);
        expect(isJunkPhone('+919810354543')).toBe(false);
    });

    it('takes the OLDEST first, skips converted/recycled/junk, caps at limit', () => {
        const leads = [
            L('+919000000001', '2026-05-01'), // recycled -> drop
            L('+919000000002', '2026-04-01'),
            L('+TEMP_x', '2026-03-01'),        // junk -> drop
            L('+919000000003', '2026-03-15'),
            L('+919000000004', '2026-02-10'), // has deal -> drop
        ];
        const out = pickForAgent(leads, new Set(['+919000000001']), new Set(['+919000000004']), 10);
        expect(out.map((x) => x.phone_number)).toEqual(['+919000000003', '+919000000002']);
    });

    it('caps at the limit (10) oldest', () => {
        const leads = Array.from({ length: 25 }, (_, i) => L(`+9190000000${String(i).padStart(2, '0')}`, `2026-04-${String((i % 28) + 1).padStart(2, '0')}`));
        const out = pickForAgent(leads, new Set(), new Set(), 10);
        expect(out.length).toBe(10);
        // strictly non-decreasing dates
        for (let i = 1; i < out.length; i++) expect(out[i].created_at.getTime()).toBeGreaterThanOrEqual(out[i - 1].created_at.getTime());
    });

    it('returns empty when everything is already recycled/converted', () => {
        const leads = [L('+919000000001', '2026-04-01'), L('+919000000002', '2026-04-02')];
        expect(pickForAgent(leads, new Set(['+919000000001']), new Set(['+919000000002']), 10)).toEqual([]);
    });
});
