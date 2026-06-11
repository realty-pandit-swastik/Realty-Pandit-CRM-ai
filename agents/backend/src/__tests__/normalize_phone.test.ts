import { describe, it, expect } from 'vitest';
import { normalizePhone, isPlaceholderPhone } from '../utils/phone';

// Regression guard for the partner-lead "incorrect number" bug: normalizePhone used to fall through
// to `+${clean}` for ANY input, so names/partials became contact keys like "+ChiragWadhwa" / "+1" / "+"
// that rendered as broken tel: links. Its contract says it returns '' for invalid input — enforce that.
describe('normalizePhone — rejects junk, keeps valid', () => {
    it('returns "" for non-numeric / implausible input', () => {
        for (const bad of ['ChiragWadhwa', 'Chirag Wadhwa', '1', '+', '+1', '99', 'abc123', 'N/A', '   ', '']) {
            expect(normalizePhone(bad)).toBe('');
        }
    });

    it('normalizes valid Indian numbers to +91 E.164', () => {
        expect(normalizePhone('9958804559')).toBe('+919958804559');
        expect(normalizePhone('+919958804559')).toBe('+919958804559');
        expect(normalizePhone('919958804559')).toBe('+919958804559');
        expect(normalizePhone('09958804559')).toBe('+919958804559');
        expect(normalizePhone('+91 99588 04559')).toBe('+919958804559');
        expect(normalizePhone('+91-9958804559')).toBe('+919958804559'); // dash format → canonical
    });

    it('accepts plausible international all-digit numbers (8–15 digits)', () => {
        expect(normalizePhone('+1-7068887334')).toBe('+17068887334');
        expect(normalizePhone('+243-973249708')).toBe('+243973249708');
    });
});

describe('isPlaceholderPhone — unchanged contract', () => {
    it('flags TEMP_/PENDING- only', () => {
        expect(isPlaceholderPhone('PENDING-8178491914-abc')).toBe(true);
        expect(isPlaceholderPhone('TEMP_123_x')).toBe(true);
        expect(isPlaceholderPhone('+919958804559')).toBe(false);
        expect(isPlaceholderPhone('')).toBe(false);
    });
});
