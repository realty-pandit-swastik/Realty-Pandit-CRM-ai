import { describe, it, expect } from 'vitest';
import { parseMenuChoice } from '../utils/menu_choice';

describe('parseMenuChoice', () => {
    it('parses a bare digit', () => {
        expect(parseMenuChoice('3')).toBe(3);
        expect(parseMenuChoice('1')).toBe(1);
    });
    it('parses common decorations', () => {
        expect(parseMenuChoice(' 2 ')).toBe(2);
        expect(parseMenuChoice('3.')).toBe(3);
        expect(parseMenuChoice('2)')).toBe(2);
        expect(parseMenuChoice('*1*')).toBe(1);
        expect(parseMenuChoice('option 3')).toBe(3);
        expect(parseMenuChoice('no. 2')).toBe(2);
        expect(parseMenuChoice('3 - cancel')).toBe(3);
    });
    it('returns null for non-menu input', () => {
        expect(parseMenuChoice('Hello')).toBeNull();
        expect(parseMenuChoice('confirm')).toBeNull();
        expect(parseMenuChoice('')).toBeNull();
        expect(parseMenuChoice('I want 2 bhk in noida')).toBeNull();
        expect(parseMenuChoice('99')).toBeNull();
        expect(parseMenuChoice('0')).toBeNull();
    });
    it('caps at 1..9 and trims emoji/space prefix', () => {
        expect(parseMenuChoice('👉 1')).toBe(1);
        expect(parseMenuChoice('9')).toBe(9);
        expect(parseMenuChoice('10')).toBeNull();
    });
});
