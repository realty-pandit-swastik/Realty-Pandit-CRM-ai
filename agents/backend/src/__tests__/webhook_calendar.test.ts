import { describe, it, expect } from 'vitest';
import { parseMenuChoice } from '../utils/menu_choice';

// Contract test: the calendar fast-path relies on parseMenuChoice to map
// numeric appointment replies (1→confirm, 2→reschedule, 3→cancel).
describe('calendar fast-path numeric contract', () => {
    it('maps 1→confirm, 2→reschedule, 3→cancel', () => {
        expect(parseMenuChoice('1')).toBe(1);
        expect(parseMenuChoice('2')).toBe(2);
        expect(parseMenuChoice('3')).toBe(3);
    });
    it('ignores free text so a sentence is not a false confirm', () => {
        expect(parseMenuChoice('confirm my visit please')).toBeNull();
        expect(parseMenuChoice('what about 2 bhk')).toBeNull();
    });
});
